import sys
sys.path.insert(0, '.')
from nts_backend.aes_siv import AESSIV
from nts_backend.nts_crypto import create_nts_session, nts_server_sign, nts_client_verify, encrypt_cookie, decrypt_cookie

print("=== AES-SIV RFC 5297 Test Vectors ===")
key128 = bytes.fromhex('fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff')
ad1 = bytes.fromhex('101112131415161718191a1b1c1d1e1f2021222324252627')
pt1 = bytes.fromhex('112233445566778899aabbccddeeff')
nonce1 = bytes.fromhex('0a0b0c0d0e0f10111213141516171819')

siv1 = AESSIV(key128)
ct1 = siv1.encrypt([ad1], nonce1, pt1)
print('  AES-128-SIV SIV:       ' + ct1[:16].hex())
print('  Expected SIV:          0ac479ac07cb91d44ecb759b44ed06ab')
assert ct1[:16].hex() == '0ac479ac07cb91d44ecb759b44ed06ab', 'SIV mismatch'
dec1 = siv1.decrypt([ad1], nonce1, ct1)
assert dec1 == pt1, 'Decrypt mismatch'
print('  AES-128-SIV CT:        ' + ct1[16:].hex())
print('  Expected CT:           ef5de0199ba99f7829975701088bc0')
assert ct1[16:].hex() == 'ef5de0199ba99f7829975701088bc0', 'CT mismatch'
print('  PASS')

key256 = bytes.fromhex('fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfefffffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff')
siv2 = AESSIV(key256)
ct2 = siv2.encrypt([ad1], nonce1, pt1)
print('  AES-256-SIV SIV:       ' + ct2[:16].hex())
print('  Expected SIV:          5437f263f1c761003ce93950cc7b9af4')
assert ct2[:16].hex() == '5437f263f1c761003ce93950cc7b9af4', 'SIV-256 mismatch'
dec2 = siv2.decrypt([ad1], nonce1, ct2)
assert dec2 == pt1, 'Decrypt-256 mismatch'
print('  AES-256-SIV CT:        ' + ct2[16:].hex())
print('  Expected CT:           409dce34cb99ff6ea8c2c190643cf8')
assert ct2[16:].hex() == '409dce34cb99ff6ea8c2c190643cf8', 'CT-256 mismatch'
print('  PASS')

print()
print("=== NTS Sign/Verify Round-Trip ===")
session = create_nts_session()
ntp_tx = b'\xe8\xc2\xb5\x6e\x00\x00\x00\x00'
nonce, ct = nts_server_sign(session, ntp_tx)
result = nts_client_verify(session, ntp_tx, nonce, ct)
print('  Sign -> Verify: ' + str(result.verified))
assert result.verified, 'NTS verify failed'
assert result.timestamp_verified, 'Timestamp verify failed'
print('  PASS')

bad_result = nts_client_verify(session, b'\x00\x00\x00\x00\x00\x00\x00\x00', nonce, ct)
print('  Tampered verify: ' + str(bad_result.verified))
assert not bad_result.verified, 'Tampered data should NOT verify'
print('  PASS')

print()
print("=== NTS Cookie Round-Trip ===")
key = bytes(range(32))
siv = AESSIV(key)
secret = b"user_id=42&role=admin&session=abc123"
nonce = bytes([i + 0xA0 for i in range(12)])
encoded = encrypt_cookie(siv, nonce, secret)
decrypted = decrypt_cookie(siv, encoded)
assert decrypted == secret, 'Cookie round-trip failed'
print('  Encoded cookie: ' + encoded)
print('  Decrypted: ' + decrypted.decode())
print('  PASS')

print()
print("=== ALL TESTS PASSED ===")
