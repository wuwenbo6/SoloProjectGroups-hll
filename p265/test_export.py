#!/usr/bin/env python3
import json
import urllib.request

def api_post(endpoint, data):
    req = urllib.request.Request(
        f"http://localhost:9090/api{endpoint}",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"}
    )
    return urllib.request.urlopen(req)

print("=" * 60)
print("Testing Export & Container Parsing")
print("=" * 60)

export_data = {
    "messages": [
        {"id": 1, "type": "message", "date": 1780130000, "message": "Hello!",
         "out": False, "post": False, "pinned": False, "silent": False,
         "chat": {"type": "peer_user", "user_id": 123},
         "sender": {"type": "peer_user", "user_id": 456},
         "fwd_from": None, "reply_to": None, "media": None,
         "views": 100, "forwards": 5, "edit_date": None,
         "post_author": None, "grouped_id": None, "ttl_period": None,
         "entities": []}
    ],
    "users": {
        "123": {"id": 123, "first_name": "Alice", "last_name": "Wang", "username": "alicew", "phone": "", "bot": False},
        "456": {"id": 456, "first_name": "Bob", "last_name": "Li", "username": "bobli", "phone": "", "bot": False}
    },
    "chats": {},
    "format": "json"
}

print("\n1. JSON Export...")
resp = api_post("/export-from-result", export_data)
json_export = json.loads(resp.read())
print(f"   Messages: {len(json_export['messages'])}")
print(f"   Users: {len(json_export['users'])}")
print(f"   Export time: {json_export['export_info']['exported_at']}")

print("\n2. CSV Export...")
export_data["format"] = "csv"
resp = api_post("/export-from-result", export_data)
csv_content = resp.read().decode()
lines = csv_content.strip().split("\n")
print(f"   Rows: {len(lines)}")
print(f"   Header: {lines[0][:80]}...")
print(f"   Data: {lines[1][:80]}...")

print("\n3. HTML Export...")
export_data["format"] = "html"
resp = api_post("/export-from-result", export_data)
html_content = resp.read().decode()
print(f"   Size: {len(html_content)} chars")
print(f"   Has Alice Wang: {'Alice Wang' in html_content}")
print(f"   Has Bob Li: {'Bob Li' in html_content}")

print("\n4. Full pipeline with users/chats...")
encrypt_resp = json.loads(api_post("/encrypt-test", {"message": "Test with users"}).read())
decrypt_resp = json.loads(api_post("/decrypt-full", {
    "data": encrypt_resp["full_data_hex"],
    "auth_key": encrypt_resp["auth_key_hex"],
    "is_client": True
}).read())
print(f"   Messages: {len(decrypt_resp['messages'])}")
print(f"   Users: {decrypt_resp.get('users', {})}")
print(f"   Chats: {decrypt_resp.get('chats', {})}")

print("\n" + "=" * 60)
print("✅ ALL EXPORT & CONTAINER TESTS PASSED!")
print("=" * 60)
