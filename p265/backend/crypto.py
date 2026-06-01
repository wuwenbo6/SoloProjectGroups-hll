import hashlib
import hmac
import os
import time
from typing import Tuple, Optional
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend


class AESIGE:
    @staticmethod
    def _xor(a: bytes, b: bytes) -> bytes:
        return bytes(x ^ y for x, y in zip(a, b))

    @classmethod
    def decrypt(cls, ciphertext: bytes, key: bytes, iv: bytes) -> bytes:
        if len(key) != 32:
            raise ValueError("Key must be 32 bytes (256 bits)")
        if len(iv) != 32:
            raise ValueError("IV must be 32 bytes")
        if len(ciphertext) % 16 != 0:
            raise ValueError("Ciphertext length must be multiple of 16")

        iv_prev = iv[:16]
        iv_next = iv[16:]

        plaintext = b""
        backend = default_backend()

        for i in range(0, len(ciphertext), 16):
            block = ciphertext[i:i + 16]

            to_decrypt = cls._xor(block, iv_next)
            cipher = Cipher(algorithms.AES(key), modes.ECB(), backend=backend)
            decryptor = cipher.decryptor()
            decrypted = decryptor.update(to_decrypt) + decryptor.finalize()
            decrypted = cls._xor(decrypted, iv_prev)

            plaintext += decrypted

            iv_prev = block
            iv_next = decrypted

        return plaintext

    @classmethod
    def encrypt(cls, plaintext: bytes, key: bytes, iv: bytes) -> bytes:
        if len(key) != 32:
            raise ValueError("Key must be 32 bytes (256 bits)")
        if len(iv) != 32:
            raise ValueError("IV must be 32 bytes")
        if len(plaintext) % 16 != 0:
            raise ValueError("Plaintext length must be multiple of 16")

        iv_prev = iv[:16]
        iv_next = iv[16:]

        ciphertext = b""
        backend = default_backend()

        for i in range(0, len(plaintext), 16):
            block = plaintext[i:i + 16]
            xored = cls._xor(block, iv_prev)

            cipher = Cipher(algorithms.AES(key), modes.ECB(), backend=backend)
            encryptor = cipher.encryptor()
            encrypted = encryptor.update(xored) + encryptor.finalize()
            encrypted = cls._xor(encrypted, iv_next)

            ciphertext += encrypted

            iv_prev = encrypted
            iv_next = block

        return ciphertext


class MTProtoCrypto:
    def __init__(self, auth_key: bytes):
        if len(auth_key) != 256:
            raise ValueError("Auth key must be 256 bytes (2048 bits)")
        self.auth_key = auth_key
        self.auth_key_id = int.from_bytes(
            hashlib.sha1(auth_key).digest()[-8:],
            "little"
        )

    @staticmethod
    def generate_key_iv(auth_key: bytes, message_key: bytes, is_client: bool = True) -> Tuple[bytes, bytes]:
        if len(auth_key) != 256:
            raise ValueError("Auth key must be 256 bytes")
        if len(message_key) != 16:
            raise ValueError("Message key must be 16 bytes")

        x = 0 if is_client else 8

        sha256_a = hashlib.sha256(message_key + auth_key[x:x + 36]).digest()
        sha256_b = hashlib.sha256(auth_key[x + 40:x + 76] + message_key).digest()

        aes_key = sha256_a[:8] + sha256_b[8:24] + sha256_a[24:32]
        aes_iv = sha256_b[:8] + sha256_a[8:24] + sha256_b[24:32]

        return aes_key, aes_iv

    def decrypt_message(self, encrypted_data: bytes, message_key: bytes,
                        salt: Optional[bytes] = None,
                        session_id: Optional[bytes] = None,
                        is_client: bool = True) -> dict:
        aes_key, aes_iv = self.generate_key_iv(self.auth_key, message_key, is_client)

        try:
            decrypted = AESIGE.decrypt(encrypted_data, aes_key, aes_iv)
        except Exception as e:
            raise ValueError(f"AES-IGE decryption failed: {e}")

        salt_size = 8 if salt is None else len(salt)
        session_id_size = 8 if session_id is None else len(session_id)
        min_header_size = salt_size + session_id_size + 8

        if len(decrypted) < min_header_size:
            raise ValueError("Decrypted data too short")

        offset = 0

        actual_salt = decrypted[offset:offset + 8]
        offset += 8

        actual_session_id = decrypted[offset:offset + 8]
        offset += 8

        message_id = int.from_bytes(decrypted[offset:offset + 8], "little")
        offset += 8

        seq_no = int.from_bytes(decrypted[offset:offset + 4], "little")
        offset += 4

        message_length = int.from_bytes(decrypted[offset:offset + 4], "little")
        offset += 4

        if message_length > len(decrypted) - offset:
            message_length = len(decrypted) - offset

        message_data = decrypted[offset:offset + message_length]

        calculated_message_key = hashlib.sha256(
            self.auth_key[88:88 + 32] + decrypted
        ).digest()[8:24]

        is_valid = (calculated_message_key == message_key)

        return {
            "salt": actual_salt,
            "session_id": actual_session_id,
            "message_id": message_id,
            "seq_no": seq_no,
            "message_length": message_length,
            "message_data": message_data,
            "is_valid": is_valid,
            "decrypted_full": decrypted
        }

    @staticmethod
    def compute_message_key(auth_key: bytes, decrypted_data: bytes) -> bytes:
        return hashlib.sha256(
            auth_key[88:88 + 32] + decrypted_data
        ).digest()[8:24]

    @staticmethod
    def generate_auth_key() -> bytes:
        return os.urandom(256)

    @staticmethod
    def derive_auth_key_from_password(password: str, salt: Optional[bytes] = None,
                                      iterations: int = 1 << 20) -> Tuple[bytes, bytes]:
        if salt is None:
            salt = os.urandom(32)

        backend = default_backend()
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=256,
            salt=salt,
            iterations=iterations,
            backend=backend
        )

        auth_key = kdf.derive(password.encode('utf-8'))
        return auth_key, salt

    @staticmethod
    def verify_auth_key(password: str, salt: bytes, expected_auth_key: bytes,
                        iterations: int = 1 << 20) -> bool:
        derived_key, _ = MTProtoCrypto.derive_auth_key_from_password(
            password, salt, iterations
        )
        return derived_key == expected_auth_key

    def encrypt_message(self, message_data: bytes, salt: bytes,
                        session_id: bytes, message_id: int,
                        seq_no: int, is_client: bool = True) -> Tuple[bytes, bytes]:
        if len(salt) != 8:
            raise ValueError("Salt must be 8 bytes")
        if len(session_id) != 8:
            raise ValueError("Session ID must be 8 bytes")

        header = (
            salt +
            session_id +
            message_id.to_bytes(8, "little") +
            seq_no.to_bytes(4, "little") +
            len(message_data).to_bytes(4, "little")
        )

        full_message = header + message_data

        padding_len = 16 - ((len(full_message) + 12) % 16)
        if padding_len == 16:
            padding_len = 0
        padding_len += 12

        import os
        padding = os.urandom(padding_len)
        padded_message = full_message + padding

        message_key = self.compute_message_key(self.auth_key, padded_message)

        aes_key, aes_iv = self.generate_key_iv(self.auth_key, message_key, is_client)

        encrypted = AESIGE.encrypt(padded_message, aes_key, aes_iv)

        return message_key, encrypted
