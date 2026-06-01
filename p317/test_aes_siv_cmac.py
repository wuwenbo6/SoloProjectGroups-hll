import unittest
import os
import struct
import base64
from aes_siv_cmac import (
    decrypt_cookie, build_cookie, encrypt_aes_siv_cmac, decrypt_aes_siv_cmac,
    parse_cookie_fields,
    CookieDecryptError, FieldLengthError, AuthenticationError, InvalidKeyError,
    COOKIE_VERSION, HEADER_SIZE, SIV_TAG_SIZE, MIN_COOKIE_SIZE,
    KEY_SIZE_128, KEY_SIZE_256,
    _validate_key_size, _validate_cookie_length, _extract_field, _dbl,
    COOKIE_FIELDS, MIN_PLAINTEXT_SIZE
)


class TestKeyValidation(unittest.TestCase):

    def test_valid_key_128_siv(self):
        key = os.urandom(KEY_SIZE_128)
        _validate_key_size(key)

    def test_valid_key_256_siv(self):
        key = os.urandom(KEY_SIZE_256)
        _validate_key_size(key)

    def test_invalid_key_size(self):
        with self.assertRaises(InvalidKeyError):
            _validate_key_size(os.urandom(16))

    def test_invalid_key_type(self):
        with self.assertRaises(InvalidKeyError):
            _validate_key_size("not_bytes")

    def test_empty_key(self):
        with self.assertRaises(InvalidKeyError):
            _validate_key_size(b'')


class TestCookieLengthValidation(unittest.TestCase):

    def test_valid_cookie(self):
        key = os.urandom(KEY_SIZE_128)
        nonce = os.urandom(16)
        plaintext = os.urandom(MIN_PLAINTEXT_SIZE)
        cookie = build_cookie(key, nonce, plaintext)
        nonce_len, ct_len = _validate_cookie_length(cookie)
        self.assertEqual(nonce_len, 16)
        self.assertGreater(ct_len, 0)

    def test_too_short_cookie(self):
        with self.assertRaises(FieldLengthError):
            _validate_cookie_length(b'\x01\x00\x10' + b'\x00' * 10)

    def test_invalid_version(self):
        bad_cookie = b'\x02\x00\x10' + b'\x00' * 30
        with self.assertRaises(FieldLengthError) as ctx:
            _validate_cookie_length(bad_cookie)
        self.assertIn("version", str(ctx.exception).lower())

    def test_nonce_too_long(self):
        bad_cookie = bytes([COOKIE_VERSION, 0x00, 0xFF]) + b'\x00' * 300
        with self.assertRaises(FieldLengthError) as ctx:
            _validate_cookie_length(bad_cookie)
        self.assertIn("Nonce length", str(ctx.exception))

    def test_cookie_shorter_than_nonce_plus_siv(self):
        bad_cookie = bytes([COOKIE_VERSION, 0x00, 32]) + b'\x00' * 20
        with self.assertRaises(FieldLengthError) as ctx:
            _validate_cookie_length(bad_cookie)
        self.assertIn("too short", str(ctx.exception).lower())

    def test_invalid_cookie_type(self):
        with self.assertRaises(FieldLengthError):
            _validate_cookie_length("string_not_bytes")


class TestFieldExtraction(unittest.TestCase):

    def test_extract_all_fields(self):
        session_id = os.urandom(16)
        user_id = struct.pack('!Q', 12345)
        timestamp = struct.pack('!Q', 1700000000)
        flags = struct.pack('!I', 1)
        ttl = struct.pack('!I', 7200)
        plaintext = session_id + user_id + timestamp + flags + ttl

        result = parse_cookie_fields(plaintext)
        self.assertEqual(result.session_id, session_id.hex())
        self.assertEqual(result.user_id, 12345)
        self.assertEqual(result.timestamp, 1700000000)
        self.assertEqual(result.flags, 1)
        self.assertEqual(result.ttl, 7200)

    def test_plaintext_too_short(self):
        with self.assertRaises(FieldLengthError) as ctx:
            parse_cookie_fields(b'\x00' * 20)
        self.assertIn("too short", str(ctx.exception).lower())

    def test_field_exceeds_boundary(self):
        plaintext = b'\x00' * (MIN_PLAINTEXT_SIZE - 1)
        with self.assertRaises(FieldLengthError) as ctx:
            _extract_field(plaintext, "ttl")
        self.assertIn("ttl", str(ctx.exception).lower())

    def test_each_field_boundary(self):
        for name, info in COOKIE_FIELDS.items():
            end = info["offset"] + info["length"]
            short_plaintext = b'\x00' * (end - 1)
            with self.assertRaises(FieldLengthError, msg=f"Field {name} should fail with short plaintext"):
                _extract_field(short_plaintext, name)


class TestDbl(unittest.TestCase):

    def test_dbl_zero_block(self):
        result = _dbl(b'\x00' * 16)
        self.assertEqual(result, b'\x00' * 16)

    def test_dbl_known_vector(self):
        block = bytes([0x01] + [0x00] * 15)
        result = _dbl(block)
        self.assertEqual(result[0], 0x02)
        self.assertEqual(result[-1], 0x00)

    def test_dbl_with_carry(self):
        block = bytes([0x80] + [0x00] * 15)
        result = _dbl(block)
        self.assertEqual(result[-1], 0x87)


class TestEncryptDecrypt(unittest.TestCase):

    def setUp(self):
        self.key = os.urandom(KEY_SIZE_128)
        self.nonce = os.urandom(16)

    def test_encrypt_decrypt_roundtrip(self):
        plaintext = os.urandom(40)
        ciphertext = encrypt_aes_siv_cmac(self.key, self.nonce, plaintext)
        decrypted = decrypt_aes_siv_cmac(self.key, self.nonce, ciphertext)
        self.assertEqual(plaintext, decrypted)

    def test_decrypt_tampered_ciphertext(self):
        plaintext = os.urandom(40)
        ciphertext = bytearray(encrypt_aes_siv_cmac(self.key, self.nonce, plaintext))
        ciphertext[-1] ^= 0xFF
        with self.assertRaises(AuthenticationError):
            decrypt_aes_siv_cmac(self.key, self.nonce, bytes(ciphertext))

    def test_decrypt_wrong_key(self):
        plaintext = os.urandom(40)
        ciphertext = encrypt_aes_siv_cmac(self.key, self.nonce, plaintext)
        wrong_key = os.urandom(KEY_SIZE_128)
        with self.assertRaises(AuthenticationError):
            decrypt_aes_siv_cmac(wrong_key, self.nonce, ciphertext)

    def test_decrypt_too_short_ciphertext(self):
        with self.assertRaises(FieldLengthError):
            decrypt_aes_siv_cmac(self.key, self.nonce, b'\x00' * 10)


class TestCookieRoundtrip(unittest.TestCase):

    def setUp(self):
        self.key = os.urandom(KEY_SIZE_128)

    def test_full_cookie_roundtrip(self):
        session_id = os.urandom(16)
        plaintext = (
            session_id
            + struct.pack('!Q', 42)
            + struct.pack('!Q', 1700000000)
            + struct.pack('!I', 1)
            + struct.pack('!I', 3600)
        )
        nonce = os.urandom(16)
        cookie_data = build_cookie(self.key, nonce, plaintext)

        result = decrypt_cookie(self.key, cookie_data)
        self.assertEqual(result.session_id, session_id.hex())
        self.assertEqual(result.user_id, 42)
        self.assertEqual(result.timestamp, 1700000000)
        self.assertEqual(result.flags, 1)
        self.assertEqual(result.ttl, 3600)

    def test_cookie_version_byte(self):
        nonce = os.urandom(16)
        plaintext = os.urandom(MIN_PLAINTEXT_SIZE)
        cookie = build_cookie(self.key, nonce, plaintext)
        self.assertEqual(cookie[0], COOKIE_VERSION)

    def test_cookie_nonce_length_byte(self):
        nonce = os.urandom(16)
        plaintext = os.urandom(MIN_PLAINTEXT_SIZE)
        cookie = build_cookie(self.key, nonce, plaintext)
        self.assertEqual(cookie[2], 16)

    def test_decrypt_tampered_cookie(self):
        nonce = os.urandom(16)
        plaintext = os.urandom(MIN_PLAINTEXT_SIZE)
        cookie = bytearray(build_cookie(self.key, nonce, plaintext))
        cookie[5] ^= 0x01
        with self.assertRaises(AuthenticationError):
            decrypt_cookie(self.key, bytes(cookie))

    def test_decrypt_with_wrong_key(self):
        nonce = os.urandom(16)
        plaintext = os.urandom(MIN_PLAINTEXT_SIZE)
        cookie = build_cookie(self.key, nonce, plaintext)
        wrong_key = os.urandom(KEY_SIZE_128)
        with self.assertRaises(AuthenticationError):
            decrypt_cookie(wrong_key, cookie)

    def test_truncated_cookie(self):
        nonce = os.urandom(16)
        plaintext = os.urandom(MIN_PLAINTEXT_SIZE)
        cookie = build_cookie(self.key, nonce, plaintext)
        with self.assertRaises(FieldLengthError):
            decrypt_cookie(self.key, cookie[:10])

    def test_key_size_256_roundtrip(self):
        key = os.urandom(KEY_SIZE_256)
        session_id = os.urandom(16)
        plaintext = (
            session_id
            + struct.pack('!Q', 999)
            + struct.pack('!Q', 1700001000)
            + struct.pack('!I', 0)
            + struct.pack('!I', 1800)
        )
        nonce = os.urandom(16)
        cookie_data = build_cookie(key, nonce, plaintext)
        result = decrypt_cookie(key, cookie_data)
        self.assertEqual(result.user_id, 999)


if __name__ == '__main__':
    unittest.main()
