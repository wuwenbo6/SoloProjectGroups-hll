import base64
import struct
import unittest

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from nts_backend.aes_siv import (
    AESSIV, InvalidKeyLength, InvalidCiphertext, InvalidNonce,
    AuthenticationFailed, _aes_cmac,
)
from nts_backend.nts_crypto import (
    parse_cookie_binary, parse_cookie, decrypt_cookie, encrypt_cookie,
    CookieData,
    CookieTooShort, UnsupportedVersion, AADLengthOverflow,
    AADLengthTooLarge, SIVFieldMissing, CiphertextTooLarge,
    Base64DecodeFailed, NoNonceInAAD, NonceTooShort, InvalidCookieFormat,
    NTSCookieError,
    MIN_COOKIE_BINARY_LEN, MIN_NONCE_LEN, SIV_FIELD_LEN,
)


class TestAESSIVRFC5297(unittest.TestCase):
    def test_aes128_siv(self):
        key = bytes.fromhex('fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff')
        ad = bytes.fromhex('101112131415161718191a1b1c1d1e1f2021222324252627')
        pt = bytes.fromhex('112233445566778899aabbccddeeff')
        nonce = bytes.fromhex('0a0b0c0d0e0f10111213141516171819')

        siv = AESSIV(key)
        ct = siv.encrypt([ad], nonce, pt)

        self.assertEqual(ct[:16].hex(), '0ac479ac07cb91d44ecb759b44ed06ab')
        self.assertEqual(ct[16:].hex(), 'ef5de0199ba99f7829975701088bc0')

        dec = siv.decrypt([ad], nonce, ct)
        self.assertEqual(dec, pt)

    def test_aes256_siv(self):
        key = bytes.fromhex('fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfefffffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff')
        ad = bytes.fromhex('101112131415161718191a1b1c1d1e1f2021222324252627')
        pt = bytes.fromhex('112233445566778899aabbccddeeff')
        nonce = bytes.fromhex('0a0b0c0d0e0f10111213141516171819')

        siv = AESSIV(key)
        ct = siv.encrypt([ad], nonce, pt)

        self.assertEqual(ct[:16].hex(), '5437f263f1c761003ce93950cc7b9af4')
        self.assertEqual(ct[16:].hex(), '409dce34cb99ff6ea8c2c190643cf8')

        dec = siv.decrypt([ad], nonce, ct)
        self.assertEqual(dec, pt)

    def test_cmac_rfc4493(self):
        key = bytes.fromhex('2b7e151628aed2a6abf7158809cf4f3c')

        cmac_empty = _aes_cmac(key, b'')
        self.assertEqual(cmac_empty.hex(), 'bb1d6929e95937287fa37d129b756746')

        msg2 = bytes.fromhex('6bc1bee22e409f96e93d7e117393172a')
        cmac_16 = _aes_cmac(key, msg2)
        self.assertEqual(cmac_16.hex(), '070a16b46b4d4144f79bdd9dd04a287c')


class TestAESSIVKeyLength(unittest.TestCase):
    def test_key_too_short(self):
        with self.assertRaises(InvalidKeyLength):
            AESSIV(b'\x00' * 16)

    def test_key_odd_length(self):
        with self.assertRaises(InvalidKeyLength):
            AESSIV(b'\x00' * 48)

    def test_key_32_bytes(self):
        siv = AESSIV(b'\x00' * 32)
        self.assertIsNotNone(siv)

    def test_key_64_bytes(self):
        siv = AESSIV(b'\x00' * 64)
        self.assertIsNotNone(siv)


class TestAESSIVDecryptChecks(unittest.TestCase):
    def setUp(self):
        self.siv = AESSIV(b'\x00' * 32)
        self.nonce = b'\x00' * 12

    def test_decrypt_too_short(self):
        with self.assertRaises(InvalidCiphertext):
            self.siv.decrypt([], self.nonce, b'\x01\x02\x03')

    def test_decrypt_empty_nonce(self):
        ct = self.siv.encrypt([], self.nonce, b'hello')
        with self.assertRaises(InvalidNonce):
            self.siv.decrypt([], b'', ct)

    def test_decrypt_tampered_ciphertext(self):
        ct = bytearray(self.siv.encrypt([], self.nonce, b'hello world'))
        ct[16] ^= 0xFF
        with self.assertRaises(AuthenticationFailed):
            self.siv.decrypt([], self.nonce, bytes(ct))

    def test_encrypt_empty_nonce_rejected(self):
        with self.assertRaises(InvalidNonce):
            self.siv.encrypt([], b'', b'test')


class TestCookieParseBoundsChecks(unittest.TestCase):
    def test_empty_data(self):
        with self.assertRaises(CookieTooShort):
            parse_cookie_binary(b'')

    def test_1_byte_version_only(self):
        with self.assertRaises(CookieTooShort):
            parse_cookie_binary(b'\x01')

    def test_3_bytes_version_and_aad_len(self):
        with self.assertRaises(CookieTooShort):
            parse_cookie_binary(b'\x01\x00\x00')

    def test_bad_version(self):
        raw = b'\x02\x00\x00' + b'\x00' * 16
        with self.assertRaises(UnsupportedVersion):
            parse_cookie_binary(raw)

    def test_aad_overflow(self):
        raw = b'\x01\x10\x00' + b'\x00' * (16 + 3)
        with self.assertRaises(AADLengthOverflow):
            parse_cookie_binary(raw)

    def test_aad_too_large(self):
        raw = b'\x01\x10\x01' + b'\x00' * (4097 + 16)
        with self.assertRaises(AADLengthTooLarge):
            parse_cookie_binary(raw)

    def test_siv_field_missing(self):
        aad_val = b'hello'
        raw = b'\x01' + struct.pack('!H', len(aad_val)) + aad_val + b'\x00' * 11
        with self.assertRaises(SIVFieldMissing):
            parse_cookie_binary(raw)

    def test_truncated_siv(self):
        raw = b'\x01\x00\x0c' + b'\x00' * 12 + b'\x00' * 8
        with self.assertRaises(SIVFieldMissing):
            parse_cookie_binary(raw)

    def test_nonce_too_short_in_aad(self):
        raw = b'\x01\x00\x08' + b'\x00' * 8 + b'\x00' * 16
        with self.assertRaises(NonceTooShort):
            parse_cookie_binary(raw)

    def test_no_nonce_empty_aad(self):
        raw = b'\x01\x00\x00' + b'\x00' * 16
        with self.assertRaises(NoNonceInAAD):
            parse_cookie_binary(raw)

    def test_valid_minimum(self):
        raw = b'\x01\x00\x0c' + b'\x00' * 12 + b'\x00' * 16
        cookie = parse_cookie_binary(raw)
        self.assertEqual(cookie.version, 1)
        self.assertEqual(len(cookie.aad), 12)
        self.assertEqual(len(cookie.nonce), 12)
        self.assertEqual(len(cookie.siv), 16)
        self.assertEqual(len(cookie.ciphertext), 0)

    def test_valid_with_ciphertext(self):
        nonce = b'\xA0\xA1\xA2\xA3\xA4\xA5\xA6\xA7\xA8\xA9\xAA\xAB'
        key = bytes(range(32))
        siv = AESSIV(key)
        plaintext = b'secure-data-payload'
        ct = siv.encrypt([], nonce, plaintext)

        raw = b'\x01' + struct.pack('!H', len(nonce)) + nonce + ct
        cookie = parse_cookie_binary(raw)
        self.assertEqual(cookie.version, 1)
        self.assertEqual(cookie.nonce, nonce)
        self.assertEqual(len(cookie.siv), 16)
        self.assertGreater(len(cookie.ciphertext), 0)


class TestCookieParseBase64(unittest.TestCase):
    def test_valid_base64(self):
        raw = b'\x01\x00\x0c' + b'\x00' * 12 + b'\x00' * 16
        encoded = base64.b64encode(raw).decode()
        cookie = parse_cookie(encoded)
        self.assertEqual(cookie.version, 1)

    def test_invalid_base64(self):
        with self.assertRaises(Base64DecodeFailed):
            parse_cookie('!!!not-base64!!!')


class TestCookieEncryptDecrypt(unittest.TestCase):
    def setUp(self):
        self.key = bytes(range(32))
        self.siv = AESSIV(self.key)
        self.nonce = bytes([i + 0xA0 for i in range(12)])
        self.payload = b'user_id=42&role=admin&session=abc123'

    def test_encrypt_decrypt_roundtrip(self):
        encoded = encrypt_cookie(self.siv, self.nonce, self.payload)
        decrypted = decrypt_cookie(self.siv, encoded)
        self.assertEqual(decrypted, self.payload)

    def test_encrypt_with_extra_aad(self):
        extra_aad = b'additional-data'
        encoded = encrypt_cookie(self.siv, self.nonce, self.payload, extra_aad=extra_aad)
        decrypted = decrypt_cookie(self.siv, encoded)
        self.assertEqual(decrypted, self.payload)

    def test_encrypt_rejects_short_nonce(self):
        with self.assertRaises(NonceTooShort):
            encrypt_cookie(self.siv, b'\x00' * 8, self.payload)

    def test_decrypt_rejects_tampered_cookie(self):
        encoded = encrypt_cookie(self.siv, self.nonce, self.payload)
        raw = bytearray(base64.b64decode(encoded))
        raw[-1] ^= 0xFF
        tampered = base64.b64encode(bytes(raw)).decode()
        with self.assertRaises(AuthenticationFailed):
            decrypt_cookie(self.siv, tampered)

    def test_decrypt_rejects_wrong_key(self):
        encoded = encrypt_cookie(self.siv, self.nonce, self.payload)
        wrong_siv = AESSIV(b'\xFF' * 32)
        with self.assertRaises(AuthenticationFailed):
            decrypt_cookie(wrong_siv, encoded)

    def test_decrypt_rejects_truncated_siv_in_cookie(self):
        raw = b'\x01\x00\x0c' + b'\x00' * 12 + b'\x00' * 8
        encoded = base64.b64encode(raw).decode()
        with self.assertRaises(SIVFieldMissing):
            decrypt_cookie(self.siv, encoded)

    def test_decrypt_empty_cookie(self):
        with self.assertRaises(CookieTooShort):
            decrypt_cookie(self.siv, base64.b64encode(b'').decode())


class TestCookieFieldBoundaryChecks(unittest.TestCase):
    def test_exact_min_length_parses(self):
        raw = b'\x01' + struct.pack('!H', 12) + b'\xAA' * 12 + b'\xBB' * 16
        cookie = parse_cookie_binary(raw)
        self.assertEqual(len(cookie.siv), 16)
        self.assertEqual(len(cookie.ciphertext), 0)

    def test_one_byte_below_min_length(self):
        raw = b'\x01' + struct.pack('!H', 12) + b'\xAA' * 12 + b'\xBB' * 15
        with self.assertRaises(SIVFieldMissing):
            parse_cookie_binary(raw)

    def test_aad_len_field_exactly_at_boundary(self):
        raw = b'\x01\x00\x00' + b'\xBB' * 16
        with self.assertRaises(NoNonceInAAD):
            parse_cookie_binary(raw)

    def test_aad_len_just_under_nonce_minimum(self):
        raw = b'\x01\x00\x0b' + b'\xAA' * 11 + b'\xBB' * 16
        with self.assertRaises(NonceTooShort):
            parse_cookie_binary(raw)

    def test_aad_len_exactly_nonce_minimum(self):
        raw = b'\x01\x00\x0c' + b'\xAA' * 12 + b'\xBB' * 16
        cookie = parse_cookie_binary(raw)
        self.assertEqual(len(cookie.nonce), 12)

    def test_aad_len_greater_than_nonce(self):
        extra = b'\xCC' * 4
        raw = b'\x01' + struct.pack('!H', 16) + b'\xAA' * 12 + extra + b'\xBB' * 16
        cookie = parse_cookie_binary(raw)
        self.assertEqual(cookie.nonce, b'\xAA' * 12)
        self.assertEqual(cookie.aad, b'\xAA' * 12 + extra)

    def test_aad_len_0_with_no_nonce(self):
        raw = b'\x01\x00\x00' + b'\xBB' * 16
        with self.assertRaises(NoNonceInAAD):
            parse_cookie_binary(raw)

    def test_ciphertext_max_boundary(self):
        nonce = b'\xAA' * 12
        ct = b'\xBB' * 16 + b'\xCC' * 65536
        raw = b'\x01' + struct.pack('!H', 12) + nonce + ct
        cookie = parse_cookie_binary(raw)
        self.assertEqual(len(cookie.ciphertext), 65536)

    def test_ciphertext_exceeds_max(self):
        nonce = b'\xAA' * 12
        ct = b'\xBB' * 16 + b'\xCC' * 65537
        raw = b'\x01' + struct.pack('!H', 12) + nonce + ct
        with self.assertRaises(CiphertextTooLarge):
            parse_cookie_binary(raw)


class TestErrorHierarchy(unittest.TestCase):
    def test_all_errors_inherit_from_nts_cookie_error(self):
        error_classes = [
            CookieTooShort, UnsupportedVersion, AADLengthOverflow,
            AADLengthTooLarge, SIVFieldMissing, CiphertextTooLarge,
            Base64DecodeFailed, NoNonceInAAD, NonceTooShort,
            InvalidCookieFormat,
        ]
        for cls in error_classes:
            self.assertTrue(
                issubclass(cls, NTSCookieError),
                f"{cls.__name__} should inherit from NTSCookieError"
            )


if __name__ == '__main__':
    unittest.main()
