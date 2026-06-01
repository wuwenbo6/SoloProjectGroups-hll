import base64
import json
import os
import unittest
import uuid

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from nts_backend.aes_siv import AESSIV
from nts_backend.nts_crypto import (
    UniqueIdentifier, UniqueIdentifierTooShort, UniqueIdentifierMismatch,
    UniqueIdentifierError, validate_unique_identifier,
    KeyMaterial, AuthOperation, CookieOperation, KeyAgreementRecord,
    create_key_agreement_record, export_key_agreement_records,
    create_nts_session, encrypt_cookie, decrypt_cookie, generate_nonce,
    MIN_UNIQUE_ID_LEN,
)


class TestUniqueIdentifier(unittest.TestCase):
    def test_generate_default_length(self):
        uid = UniqueIdentifier.generate()
        self.assertEqual(len(uid.identifier), 32)
        self.assertGreater(uid.created_at, 0)

    def test_generate_custom_length(self):
        uid = UniqueIdentifier.generate(64)
        self.assertEqual(len(uid.identifier), 64)
        self.assertEqual(uid.to_dict()["length"], 64)

    def test_generate_minimum_length(self):
        uid = UniqueIdentifier.generate(16)
        self.assertEqual(len(uid.identifier), 16)

    def test_generate_too_short(self):
        with self.assertRaises(UniqueIdentifierTooShort):
            UniqueIdentifier.generate(15)

    def test_init_too_short(self):
        with self.assertRaises(UniqueIdentifierTooShort):
            UniqueIdentifier(identifier=b'\x00' * 15)

    def test_from_uuid(self):
        uid = UniqueIdentifier.from_uuid()
        self.assertEqual(len(uid.identifier), 16)

    def test_to_hex(self):
        data = bytes([0xA0, 0xB0, 0xC0, 0xD0] * 4)
        uid = UniqueIdentifier(identifier=data)
        self.assertEqual(uid.to_hex(), "a0b0c0d0" * 4)

    def test_from_hex_valid(self):
        hex_str = "a0b0c0d0" * 4
        uid = UniqueIdentifier.from_hex(hex_str)
        self.assertEqual(uid.to_hex(), hex_str)

    def test_from_hex_invalid(self):
        with self.assertRaises(UniqueIdentifierError):
            UniqueIdentifier.from_hex("not a hex string!!")

    def test_matches_equal(self):
        data = os.urandom(32)
        uid1 = UniqueIdentifier(identifier=data)
        self.assertTrue(uid1.matches(data))

    def test_matches_different_length(self):
        uid = UniqueIdentifier(identifier=os.urandom(32))
        self.assertFalse(uid.matches(os.urandom(16)))

    def test_matches_different_content(self):
        data = os.urandom(32)
        uid = UniqueIdentifier(identifier=data)
        different = bytearray(data)
        different[0] ^= 0xFF
        self.assertFalse(uid.matches(bytes(different)))

    def test_matches_constant_time(self):
        data = os.urandom(32)
        uid = UniqueIdentifier(identifier=data)
        self.assertTrue(uid.matches(data))
        tampered = bytearray(data)
        tampered[-1] ^= 0xFF
        self.assertFalse(uid.matches(bytes(tampered)))


class TestValidateUniqueIdentifier(unittest.TestCase):
    def test_valid_match(self):
        data = os.urandom(32)
        self.assertTrue(validate_unique_identifier(data, data))

    def test_valid_mismatch(self):
        data1 = os.urandom(32)
        data2 = bytes([data1[0] ^ 0xFF] + list(data1[1:]))
        self.assertFalse(validate_unique_identifier(data1, data2))

    def test_expected_too_short(self):
        with self.assertRaises(UniqueIdentifierTooShort):
            validate_unique_identifier(b'\x00' * 15, b'\x00' * 32)

    def test_provided_too_short(self):
        with self.assertRaises(UniqueIdentifierTooShort):
            validate_unique_identifier(b'\x00' * 32, b'\x00' * 15)

    def test_length_mismatch(self):
        with self.assertRaises(UniqueIdentifierMismatch):
            validate_unique_identifier(b'\x00' * 16, b'\x00' * 32)


class TestKeyMaterial(unittest.TestCase):
    def test_to_dict(self):
        km = KeyMaterial(
            c2s_key=bytes(range(32)),
            s2c_key=bytes(range(32)),
            cookie_key=bytes(range(32)),
        )
        d = km.to_dict()
        self.assertEqual(len(d["c2s_key_hex"]), 64)
        self.assertEqual(d["c2s_key_len"], 32)
        self.assertEqual(len(d["s2c_key_hex"]), 64)
        self.assertEqual(d["s2c_key_len"], 32)
        self.assertEqual(len(d["cookie_key_hex"]), 64)
        self.assertEqual(d["cookie_key_len"], 32)


class TestKeyAgreementRecord(unittest.TestCase):
    def setUp(self):
        self.session = create_nts_session()
        self.record = create_key_agreement_record(self.session, "test-session-123")

    def test_create_record_structure(self):
        self.assertEqual(self.record.session_id, "test-session-123")
        self.assertIsNotNone(self.record.record_id)
        self.assertEqual(self.record.negotiated_protocol, "NTSv4")
        self.assertEqual(self.record.aead_algorithm, "AEAD_AES_SIV_CMAC_256")
        self.assertEqual(self.record.status, "active")
        self.assertEqual(len(self.record.auth_operations), 0)
        self.assertEqual(len(self.record.cookie_operations), 0)

    def test_to_dict_with_keys(self):
        d = self.record.to_dict(include_key_material=True)
        self.assertIn("key_material", d)
        self.assertIn("unique_identifier", d)
        self.assertEqual(d["session_id"], "test-session-123")

    def test_to_dict_without_keys(self):
        d = self.record.to_dict(include_key_material=False)
        self.assertNotIn("key_material", d)
        self.assertIn("unique_identifier", d)

    def test_add_auth_operation(self):
        nonce = os.urandom(16)
        ct = os.urandom(32)
        tx = os.urandom(8)
        op = self.record.add_auth_operation(
            operation="server_sign",
            nonce=nonce,
            ciphertext=ct,
            ntp_transmit=tx,
            success=True,
        )
        self.assertEqual(op.operation, "server_sign")
        self.assertTrue(op.success)
        self.assertEqual(len(self.record.auth_operations), 1)
        self.assertEqual(self.record.to_dict()["auth_operations_count"], 1)

    def test_add_cookie_operation(self):
        cookie_b64 = "AQAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        op = self.record.add_cookie_operation(
            operation="encrypt",
            cookie_b64=cookie_b64,
            success=True,
            plaintext=b"test",
            nonce=os.urandom(12),
        )
        self.assertEqual(op.operation, "encrypt")
        self.assertTrue(op.success)
        self.assertEqual(len(self.record.cookie_operations), 1)
        self.assertEqual(self.record.to_dict()["cookie_operations_count"], 1)

    def test_export_json(self):
        json_str = self.record.export_json(pretty=False)
        data = json.loads(json_str)
        self.assertEqual(data["session_id"], "test-session-123")
        self.assertIn("unique_identifier", data)

    def test_export_json_pretty(self):
        json_str = self.record.export_json(pretty=True)
        self.assertIn("\n", json_str)
        data = json.loads(json_str)
        self.assertEqual(data["session_id"], "test-session-123")

    def test_get_summary(self):
        summary = self.record.get_summary()
        self.assertEqual(summary["session_id"], "test-session-123")
        self.assertEqual(summary["status"], "active")
        self.assertIn("unique_id_prefix", summary)
        self.assertEqual(summary["auth_ops"], 0)
        self.assertEqual(summary["cookie_ops"], 0)

    def test_export_multiple_records(self):
        session2 = create_nts_session()
        record2 = create_key_agreement_record(session2, "session-456")
        records = [self.record, record2]
        json_str = export_key_agreement_records(records)
        data = json.loads(json_str)
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["session_id"], "test-session-123")
        self.assertEqual(data[1]["session_id"], "session-456")

    def test_full_workflow_with_operations(self):
        nonce = os.urandom(12)
        plaintext = b"important-data"
        siv = AESSIV(self.session.cookie_key)
        cookie = encrypt_cookie(siv, nonce, plaintext)
        self.record.add_cookie_operation(
            operation="encrypt",
            cookie_b64=cookie,
            success=True,
            plaintext=plaintext,
            nonce=nonce,
        )

        decrypted = decrypt_cookie(siv, cookie)
        self.assertEqual(decrypted, plaintext)

        auth_nonce = os.urandom(16)
        auth_ct = os.urandom(32)
        tx = os.urandom(8)
        self.record.add_auth_operation(
            operation="client_verify",
            nonce=auth_nonce,
            ciphertext=auth_ct,
            ntp_transmit=tx,
            success=True,
        )

        self.record.server_cookie = cookie

        d = self.record.to_dict()
        self.assertEqual(d["auth_operations_count"], 1)
        self.assertEqual(d["cookie_operations_count"], 1)
        self.assertIsNotNone(d["server_cookie"])

    def test_error_operation_recording(self):
        self.record.add_auth_operation(
            operation="client_verify",
            nonce=os.urandom(16),
            ciphertext=os.urandom(32),
            ntp_transmit=os.urandom(8),
            success=False,
            error="SIV tag mismatch",
        )
        self.assertEqual(self.record.auth_operations[0].error, "SIV tag mismatch")
        self.assertFalse(self.record.auth_operations[0].success)

    def test_uuid_generated_record_id(self):
        self.assertTrue(uuid.UUID(self.record.record_id))


class TestAuthOperation(unittest.TestCase):
    def test_to_dict(self):
        op = AuthOperation(
            timestamp=1000000,
            operation="test_op",
            nonce_hex="abcd",
            ciphertext_hex="1234",
            ntp_transmit_hex="5678",
            success=True,
        )
        d = op.to_dict()
        self.assertEqual(d["operation"], "test_op")
        self.assertEqual(d["success"], True)
        self.assertEqual(d["timestamp_str"], "1970-01-12T13:46:40")


class TestCookieOperation(unittest.TestCase):
    def test_to_dict(self):
        op = CookieOperation(
            timestamp=1000000,
            operation="encrypt",
            cookie_b64="abc=",
            success=True,
            plaintext_hex="1234",
            nonce_hex="5678",
        )
        d = op.to_dict()
        self.assertEqual(d["operation"], "encrypt")
        self.assertEqual(d["cookie_b64"], "abc=")
        self.assertEqual(d["plaintext_hex"], "1234")
        self.assertEqual(d["nonce_hex"], "5678")


class TestUniqueIdentifierDict(unittest.TestCase):
    def test_to_dict(self):
        uid = UniqueIdentifier(identifier=bytes([0xAA] * 16), created_at=1000000)
        d = uid.to_dict()
        self.assertEqual(d["identifier_hex"], "aa" * 16)
        self.assertEqual(d["length"], 16)
        self.assertEqual(d["created_at"], 1000000)
        self.assertEqual(d["created_at_str"], "1970-01-12T13:46:40")


if __name__ == '__main__':
    unittest.main()
