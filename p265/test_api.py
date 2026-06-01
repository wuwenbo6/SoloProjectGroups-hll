#!/usr/bin/env python3
import json
import urllib.request
import urllib.error

BASE_URL = "http://localhost:9090"

def api_request(endpoint, data):
    url = f"{BASE_URL}/api{endpoint}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_data = json.loads(e.read().decode("utf-8"))
        raise Exception(f"API Error: {error_data.get('error', str(e))}")

def main():
    print("=" * 60)
    print("Testing MTProto Parser API")
    print("=" * 60)
    print()

    print("1. Testing /api/encrypt-test...")
    encrypt_result = api_request("/encrypt-test", {
        "message": "你好，这是从API测试的消息！Hello from API test!"
    })
    print(f"   ✅ Generated test data")
    print(f"   Auth Key ID: {encrypt_result['auth_key_id']}")
    print(f"   Message: {encrypt_result['message_text']}")
    print()

    print("2. Testing /api/decrypt-full...")
    decrypt_result = api_request("/decrypt-full", {
        "data": encrypt_result["full_data_hex"],
        "auth_key": encrypt_result["auth_key_hex"],
        "is_client": True
    })
    print(f"   ✅ Decrypted successfully")
    print(f"   Transport Type: {decrypt_result['transport_type']}")
    print(f"   Integrity Check: {decrypt_result['is_valid']}")
    print(f"   Messages Found: {len(decrypt_result['messages'])}")
    print()

    for i, msg in enumerate(decrypt_result["messages"]):
        print(f"   Message #{i+1}:")
        print(f"     ID: {msg['id']}")
        print(f"     Type: {msg['type']}")
        print(f"     Text: {msg.get('message', '(no text)')}")
        print(f"     Date: {msg['date']}")
        print(f"     Chat: {msg.get('chat', {})}")
        print(f"     Sender: {msg.get('sender', {})}")
    print()

    print("3. Testing /api/transport/detect...")
    detect_result = api_request("/transport/detect", {
        "data": encrypt_result["full_data_hex"]
    })
    print(f"   ✅ Detected transport type: {detect_result['transport_type']}")
    print()

    print("4. Testing /api/auth-key/add...")
    add_key_result = api_request("/auth-key/add", {
        "name": "test_key",
        "auth_key": encrypt_result["auth_key_hex"]
    })
    print(f"   ✅ Added auth key: {add_key_result['name']}")
    print()

    print("5. Testing /api/auth-key/list...")
    list_result = json.loads(urllib.request.urlopen(f"{BASE_URL}/api/auth-key/list").read())
    print(f"   ✅ Saved keys: {len(list_result['keys'])}")
    for key in list_result["keys"]:
        print(f"     - {key['name']}: {key['auth_key_id']}")
    print()

    print("6. Testing /api/decrypt-with-key...")
    decrypt_with_key_result = api_request("/decrypt-with-key", {
        "key_name": "test_key",
        "data": encrypt_result["full_data_hex"],
        "is_client": True
    })
    print(f"   ✅ Decrypted with saved key")
    print(f"   Messages found: {len(decrypt_with_key_result['messages'])}")
    print()

    print("=" * 60)
    print("✅ ALL API TESTS PASSED!")
    print("=" * 60)
    print()
    print(f"Open {BASE_URL} in your browser to use the web interface")

if __name__ == "__main__":
    main()
