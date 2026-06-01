import requests
import json

base = 'http://localhost:9090'

print("=== API Integration Tests ===")

# 1. Generate UID (32B)
print("\n1. Generate Unique Identifier (32B)")
r = requests.get(f'{base}/api/nts/unique-identifier/generate?length=32')
d = r.json()
uid_hex = d['identifier_hex']
print(f"   Identifier: {uid_hex[:32]}...")
print(f"   Length: {d['length']}")
assert d['length'] == 32
print("   PASS")

# 2. Generate UUIDv4
print("\n2. Generate UUIDv4 (16B)")
r = requests.get(f'{base}/api/nts/unique-identifier/generate-uuid')
d = r.json()
print(f"   Identifier: {d['identifier_hex']}")
print(f"   Length: {d['length']}")
assert d['length'] == 16
print("   PASS")

# 3. Create Session
print("\n3. Create Session with Key Agreement Record")
r = requests.post(f'{base}/api/nts/session')
d = r.json()
sid = d['session_id']
rid = d['key_agreement_record_id']
print(f"   Session ID: {sid}")
print(f"   Record ID: {rid[:18]}...")
assert 'key_agreement_record_id' in d
print("   PASS")

# 4. Sign (records operations)
print("\n4. Sign (records auth and cookie operations)")
r = requests.post(f'{base}/api/nts/sign', json={
    'session_id': sid,
    'ntp_transmit_hex': 'e8c2b56e00000000'
})
d = r.json()
print(f"   Status: {r.status_code}")
print(f"   Server auth nonce: {d['server_auth']['nonce_hex'][:16]}...")
assert r.status_code == 200
print("   PASS")

# 5. List Key Agreement Records
print("\n5. List Key Agreement Records")
r = requests.get(f'{base}/api/nts/key-agreement/list')
d = r.json()
print(f"   Total: {d['total']}")
assert d['total'] >= 1
# Find our session
rec = None
for record in d['records']:
    if record['session_id'] == sid:
        rec = record
        break
assert rec is not None, f"Session {sid} not found in list"
print(f"   Session: {rec['session_id']}")
print(f"   Auth ops: {rec['auth_ops']}")
print(f"   Cookie ops: {rec['cookie_ops']}")
assert rec['auth_ops'] >= 2
assert rec['cookie_ops'] >= 1
print("   PASS")

# 6. Get Record Detail
print("\n6. Get Record Detail")
r = requests.get(f'{base}/api/nts/key-agreement/{sid}?include_key_material=true')
d = r.json()
print(f"   Protocol: {d['negotiated_protocol']}")
print(f"   AEAD: {d['aead_algorithm']}")
print(f"   Auth ops count: {d['auth_operations_count']}")
print(f"   Cookie ops count: {d['cookie_operations_count']}")
assert 'unique_identifier' in d
assert 'key_material' in d
print("   PASS")

# 7. Validate UID - match
print("\n7. Validate Unique Identifier (match)")
stored_uid = d['unique_identifier']['identifier_hex']
r = requests.post(f'{base}/api/nts/unique-identifier/validate', json={
    'expected_id_hex': stored_uid,
    'provided_id_hex': stored_uid
})
d = r.json()
print(f"   Valid: {d['valid']}")
assert d['valid'] == True
print("   PASS")

# 8. Validate UID - mismatch
print("\n8. Validate Unique Identifier (mismatch)")
bad_uid = 'aabbccdd' * 8
r = requests.post(f'{base}/api/nts/unique-identifier/validate', json={
    'expected_id_hex': stored_uid,
    'provided_id_hex': bad_uid
})
d = r.json()
print(f"   Valid: {d['valid']}")
assert d['valid'] == False
print("   PASS")

# 9. UID Info
print("\n9. Unique Identifier Info")
r = requests.get(f'{base}/api/nts/unique-identifier/info?identifier_hex={stored_uid}')
d = r.json()
print(f"   Length: {d['length']}")
print(f"   Created: {d['created_at_str']}")
assert d['length'] == 32
print("   PASS")

# 10. Export Single Record
print("\n10. Export Single Record")
r = requests.get(f'{base}/api/nts/key-agreement/{sid}/export?include_key_material=true&pretty=true')
assert r.headers['Content-Type'] == 'application/json'
d = r.json()
print(f"   Exported session: {d['session_id']}")
assert d['session_id'] == sid
print("   PASS")

# 11. Export All Records
print("\n11. Export All Records")
r = requests.post(f'{base}/api/nts/key-agreement/export', json={
    'session_id': None,
    'include_key_material': True,
    'pretty': True
})
assert r.headers['Content-Type'] == 'application/json'
d = r.json()
print(f"   Exported {len(d)} records")
assert len(d) >= 1
print("   PASS")

print("\n=== ALL API TESTS PASSED ===")
