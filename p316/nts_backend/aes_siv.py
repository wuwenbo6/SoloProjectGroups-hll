import struct
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.modes import CTR
from cryptography.hazmat.backends import default_backend


RB_128 = 0x87
RB_64 = 0x1B


class AESSIVError(Exception):
    pass


class InvalidKeyLength(AESSIVError):
    pass


class InvalidCiphertext(AESSIVError):
    pass


class InvalidNonce(AESSIVError):
    pass


class AuthenticationFailed(AESSIVError):
    pass


def _shift_left(data: bytes) -> bytes:
    out = bytearray(len(data))
    carry = 0
    for i in range(len(data) - 1, -1, -1):
        out[i] = ((data[i] << 1) | carry) & 0xFF
        carry = (data[i] >> 7) & 1
    return bytes(out)


def _xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))


def _cmac_subkeys(key: bytes) -> tuple:
    cipher = Cipher(algorithms.AES(key), modes.ECB(), backend=default_backend())
    enc = cipher.encryptor()
    l = enc.update(b"\x00" * 16) + enc.finalize()

    k1 = _shift_left(l)
    if l[0] & 0x80:
        k1 = k1[:-1] + bytes([k1[-1] ^ RB_128])

    k2 = _shift_left(k1)
    if k1[0] & 0x80:
        k2 = k2[:-1] + bytes([k2[-1] ^ RB_128])

    return k1, k2


def _aes_cmac(key: bytes, message: bytes) -> bytes:
    cipher = Cipher(algorithms.AES(key), modes.ECB(), backend=default_backend())
    enc = cipher.encryptor()

    k1, k2 = _cmac_subkeys(key)

    msg_len = len(message)

    if msg_len == 0:
        padded = b"\x80" + b"\x00" * 15
        block = _xor_bytes(padded, k2)
        return enc.update(block) + enc.finalize()

    n = (msg_len + 15) // 16
    complete = msg_len % 16 == 0

    x = b"\x00" * 16
    for i in range(n - 1):
        block = _xor_bytes(message[i * 16:(i + 1) * 16], x)
        x = enc.update(block) + enc.finalize()
        enc = Cipher(algorithms.AES(key), modes.ECB(), backend=default_backend()).encryptor()

    last_start = (n - 1) * 16
    remaining = msg_len - last_start

    if complete:
        last_block = _xor_bytes(message[last_start:last_start + 16], k1)
    else:
        last_raw = message[last_start:]
        padded = last_raw + b"\x80" + b"\x00" * (16 - remaining - 1)
        last_block = _xor_bytes(padded, k2)

    final_block = _xor_bytes(last_block, x)
    return enc.update(final_block) + enc.finalize()


def _s2v(k1: bytes, inputs: list) -> bytes:
    if not inputs:
        return _aes_cmac(k1, b"\x00" * 16)

    one_block = b"\x01" * 16
    d = _aes_cmac(k1, one_block)

    for inp in inputs[:-1]:
        d = _shift_left(d)
        cmac_val = _aes_cmac(k1, inp)
        d = _xor_bytes(d, cmac_val)

    last = inputs[-1]
    if len(last) >= 16:
        xored = bytearray(last)
        for i in range(16):
            xored[i] ^= d[i]
        return _aes_cmac(k1, bytes(xored))
    else:
        d = _shift_left(d)
        padded = bytearray(16)
        padded[:len(last)] = last
        padded[len(last)] = 0x80
        result = _xor_bytes(bytes(padded), d)
        return _aes_cmac(k1, result)


def _ctr_crypt(k2: bytes, iv: bytes, data: bytes) -> bytes:
    ctr_iv = bytearray(iv)
    ctr_iv[8] &= 0x7F

    cipher = Cipher(algorithms.AES(k2), CTR(bytes(ctr_iv)), backend=default_backend())
    enc = cipher.encryptor()
    return enc.update(data) + enc.finalize()


class AESSIV:
    def __init__(self, key: bytes):
        key_len = len(key)
        if key_len not in (32, 64):
            raise InvalidKeyLength(f"Key must be 32 or 64 bytes, got {key_len}")

        half = key_len // 2
        self.k1 = key[:half]
        self.k2 = key[half:]

    def encrypt(self, associated_data: list, nonce: bytes, plaintext: bytes) -> bytes:
        if len(nonce) == 0:
            raise InvalidNonce("Nonce must not be empty")
        inputs = list(associated_data) + [nonce, plaintext]
        siv = _s2v(self.k1, inputs)
        ciphertext = _ctr_crypt(self.k2, siv, plaintext)
        return siv + ciphertext

    def decrypt(self, associated_data: list, nonce: bytes, ciphertext: bytes) -> bytes:
        if len(nonce) == 0:
            raise InvalidNonce("Nonce must not be empty")
        if len(ciphertext) < 16:
            raise InvalidCiphertext(
                f"Ciphertext must be at least 16 bytes for SIV tag, got {len(ciphertext)}"
            )

        siv = ciphertext[:16]
        encrypted_payload = ciphertext[16:]

        plaintext = _ctr_crypt(self.k2, siv, encrypted_payload)

        inputs = list(associated_data) + [nonce, plaintext]
        computed_siv = _s2v(self.k1, inputs)

        if not _constant_time_compare(siv, computed_siv):
            raise AuthenticationFailed("SIV authentication failed: tag mismatch")

        return plaintext


def _constant_time_compare(a: bytes, b: bytes) -> bool:
    if len(a) != len(b):
        return False
    result = 0
    for x, y in zip(a, b):
        result |= x ^ y
    return result == 0
