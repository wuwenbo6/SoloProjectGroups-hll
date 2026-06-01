import struct
import hmac
import hashlib
from typing import Optional, Tuple, List, Dict
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.cmac import CMAC
from cryptography.hazmat.primitives.ciphers.aead import AESSIV
from cryptography.hazmat.backends import default_backend

COOKIE_VERSION = 0x01
HEADER_SIZE = 3
SIV_TAG_SIZE = 16
AES_BLOCK_SIZE = 16
MIN_COOKIE_SIZE = HEADER_SIZE + SIV_TAG_SIZE
MAX_NONCE_SIZE = 64
MAX_CIPHERTEXT_SIZE = 65536

KEY_SIZE_256 = 64
KEY_SIZE_192 = 48
KEY_SIZE_128 = 32

VALID_KEY_SIZES = {KEY_SIZE_128, KEY_SIZE_192, KEY_SIZE_256}

COOKIE_FIELDS = {
    "session_id": {"offset": 0, "length": 16, "type": "bytes"},
    "user_id": {"offset": 16, "length": 8, "type": "uint64"},
    "timestamp": {"offset": 24, "length": 8, "type": "uint64"},
    "flags": {"offset": 32, "length": 4, "type": "uint32"},
    "ttl": {"offset": 36, "length": 4, "type": "uint32"},
}

MIN_PLAINTEXT_SIZE = 40


class CookieDecryptError(Exception):
    pass


class FieldLengthError(CookieDecryptError):
    pass


class AuthenticationError(CookieDecryptError):
    pass


class InvalidKeyError(CookieDecryptError):
    pass


@dataclass
class DecryptedCookie:
    session_id: str
    user_id: int
    timestamp: int
    flags: int
    ttl: int
    raw_fields: Dict[str, bytes]


def _validate_key_size(key: bytes) -> None:
    if not isinstance(key, (bytes, bytearray)):
        raise InvalidKeyError(f"Key must be bytes, got {type(key).__name__}")
    if len(key) not in VALID_KEY_SIZES:
        raise InvalidKeyError(
            f"Invalid key size: {len(key)} bytes. "
            f"Expected one of {sorted(VALID_KEY_SIZES)} bytes "
            f"(AES-{len(key) * 4 if len(key) in VALID_KEY_SIZES else '?'} SIV requires double-length key)"
        )


def _validate_cookie_length(cookie_data: bytes) -> Tuple[int, int]:
    if not isinstance(cookie_data, (bytes, bytearray)):
        raise FieldLengthError(f"Cookie data must be bytes, got {type(cookie_data).__name__}")

    total_len = len(cookie_data)

    if total_len < MIN_COOKIE_SIZE:
        raise FieldLengthError(
            f"Cookie too short: {total_len} bytes, minimum is {MIN_COOKIE_SIZE} bytes "
            f"({HEADER_SIZE} header + {SIV_TAG_SIZE} SIV tag)"
        )

    version = cookie_data[0]
    if version != COOKIE_VERSION:
        raise FieldLengthError(f"Unsupported cookie version: {version}, expected {COOKIE_VERSION}")

    flags = cookie_data[1]
    nonce_len = cookie_data[2]

    if nonce_len > MAX_NONCE_SIZE:
        raise FieldLengthError(
            f"Nonce length {nonce_len} exceeds maximum {MAX_NONCE_SIZE}"
        )

    ciphertext_offset = HEADER_SIZE + nonce_len
    if total_len < ciphertext_offset + SIV_TAG_SIZE:
        raise FieldLengthError(
            f"Cookie too short for nonce + SIV: need at least "
            f"{ciphertext_offset + SIV_TAG_SIZE} bytes, got {total_len}"
        )

    ciphertext_len = total_len - ciphertext_offset - SIV_TAG_SIZE
    if ciphertext_len > MAX_CIPHERTEXT_SIZE:
        raise FieldLengthError(
            f"Ciphertext length {ciphertext_len} exceeds maximum {MAX_CIPHERTEXT_SIZE}"
        )

    return nonce_len, ciphertext_len


def _xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))


def _cmac_k1(key_half: bytes, data: bytes) -> bytes:
    c = CMAC(algorithms.AES(key_half), backend=default_backend())
    c.update(data)
    return c.finalize()


def _s2v(k1: bytes, ad_list: List[bytes]) -> bytes:
    d = _cmac_k1(k1, b'\x00' * AES_BLOCK_SIZE)

    if len(ad_list) == 0:
        return _cmac_k1(k1, _xor_bytes(_dbl(d), b'\x01' + b'\x00' * 15))

    for i, ad in enumerate(ad_list):
        if i < len(ad_list) - 1:
            if len(ad) >= AES_BLOCK_SIZE:
                d = _cmac_k1(k1, _xor_bytes(_dbl(d), ad))
            else:
                padded = ad + b'\x80' + b'\x00' * (AES_BLOCK_SIZE - len(ad) - 1)
                d = _cmac_k1(k1, _xor_bytes(_dbl(d), padded))
        else:
            if len(ad) >= AES_BLOCK_SIZE:
                xored = _xor_bytes(ad, _dbl(d))
                return _cmac_k1(k1, xored)
            else:
                padded = ad + b'\x80' + b'\x00' * (AES_BLOCK_SIZE - len(ad) - 1)
                return _cmac_k1(k1, _xor_bytes(_dbl(d), padded))

    return d


def _dbl(block: bytes) -> bytes:
    carry = 0
    result = bytearray(AES_BLOCK_SIZE)
    for i in range(AES_BLOCK_SIZE - 1, -1, -1):
        result[i] = ((block[i] << 1) | carry) & 0xFF
        carry = (block[i] >> 7) & 0x01
    if carry:
        result[AES_BLOCK_SIZE - 1] ^= 0x87
    return bytes(result)


def decrypt_aes_siv_cmac(key: bytes, nonce: bytes, siv_and_ciphertext: bytes) -> bytes:
    _validate_key_size(key)

    if len(siv_and_ciphertext) < SIV_TAG_SIZE:
        raise FieldLengthError(
            f"Ciphertext too short: {len(siv_and_ciphertext)} bytes, "
            f"minimum {SIV_TAG_SIZE} bytes for SIV tag"
        )

    aes_siv = AESSIV(key)
    try:
        plaintext = aes_siv.decrypt(siv_and_ciphertext, [nonce] if nonce else None)
    except Exception:
        raise AuthenticationError("SIV authentication failed: tag mismatch")

    return plaintext


def decrypt_aes_siv_cmac_simple(key: bytes, nonce: bytes, ciphertext: bytes) -> bytes:
    _validate_key_size(key)
    aes_siv = AESSIV(key)
    try:
        return aes_siv.decrypt(ciphertext, [nonce] if nonce else None)
    except Exception as e:
        raise AuthenticationError(f"Decryption failed: {e}")


def _validate_plaintext_fields(plaintext: bytes) -> None:
    if len(plaintext) < MIN_PLAINTEXT_SIZE:
        raise FieldLengthError(
            f"Decrypted plaintext too short: {len(plaintext)} bytes, "
            f"minimum {MIN_PLAINTEXT_SIZE} bytes for cookie fields"
        )

    for field_name, field_info in COOKIE_FIELDS.items():
        start = field_info["offset"]
        length = field_info["length"]
        end = start + length

        if end > len(plaintext):
            raise FieldLengthError(
                f"Field '{field_name}' at offset {start} length {length} "
                f"exceeds plaintext size {len(plaintext)} bytes"
            )


def _extract_field(plaintext: bytes, field_name: str) -> bytes:
    field_info = COOKIE_FIELDS[field_name]
    start = field_info["offset"]
    length = field_info["length"]
    end = start + length

    if end > len(plaintext):
        raise FieldLengthError(
            f"Field '{field_name}' exceeds plaintext boundary: "
            f"offset {start} + length {length} = {end} > {len(plaintext)}"
        )

    return plaintext[start:end]


def parse_cookie_fields(plaintext: bytes) -> DecryptedCookie:
    _validate_plaintext_fields(plaintext)

    session_id_bytes = _extract_field(plaintext, "session_id")
    user_id_bytes = _extract_field(plaintext, "user_id")
    timestamp_bytes = _extract_field(plaintext, "timestamp")
    flags_bytes = _extract_field(plaintext, "flags")
    ttl_bytes = _extract_field(plaintext, "ttl")

    return DecryptedCookie(
        session_id=session_id_bytes.hex(),
        user_id=struct.unpack("!Q", user_id_bytes)[0],
        timestamp=struct.unpack("!Q", timestamp_bytes)[0],
        flags=struct.unpack("!I", flags_bytes)[0],
        ttl=struct.unpack("!I", ttl_bytes)[0],
        raw_fields={
            "session_id": session_id_bytes,
            "user_id": user_id_bytes,
            "timestamp": timestamp_bytes,
            "flags": flags_bytes,
            "ttl": ttl_bytes,
        },
    )


def decrypt_cookie(key: bytes, cookie_data: bytes) -> DecryptedCookie:
    _validate_key_size(key)

    nonce_len, ciphertext_len = _validate_cookie_length(cookie_data)

    nonce = cookie_data[HEADER_SIZE:HEADER_SIZE + nonce_len]
    if len(nonce) != nonce_len:
        raise FieldLengthError(
            f"Nonce extraction failed: expected {nonce_len} bytes, got {len(nonce)}"
        )

    ciphertext_offset = HEADER_SIZE + nonce_len
    siv_and_ciphertext = cookie_data[ciphertext_offset:]

    if len(siv_and_ciphertext) != SIV_TAG_SIZE + ciphertext_len:
        raise FieldLengthError(
            f"SIV+ciphertext size mismatch: expected {SIV_TAG_SIZE + ciphertext_len}, "
            f"got {len(siv_and_ciphertext)}"
        )

    plaintext = decrypt_aes_siv_cmac(key, nonce, siv_and_ciphertext)

    return parse_cookie_fields(plaintext)


def encrypt_aes_siv_cmac(key: bytes, nonce: bytes, plaintext: bytes) -> bytes:
    _validate_key_size(key)

    aes_siv = AESSIV(key)
    ciphertext = aes_siv.encrypt(plaintext, [nonce] if nonce else None)
    return ciphertext


def build_cookie(key: bytes, nonce: bytes, plaintext: bytes) -> bytes:
    _validate_key_size(key)

    if len(nonce) > MAX_NONCE_SIZE:
        raise FieldLengthError(f"Nonce too long: {len(nonce)} > {MAX_NONCE_SIZE}")

    ciphertext = encrypt_aes_siv_cmac(key, nonce, plaintext)

    header = bytes([COOKIE_VERSION, 0x00, len(nonce)])
    return header + nonce + ciphertext
