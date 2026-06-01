#!/usr/bin/env python3
import json
import urllib.request
import urllib.error
import time

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

def api_get(endpoint):
    url = f"{BASE_URL}/api{endpoint}"
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode("utf-8"))

def main():
    print("=" * 70)
    print("Testing Enhanced Security Features")
    print("=" * 70)
    print()

    print("=" * 70)
    print("PART 1: PBKDF2 Key Derivation (2^20 iterations)")
    print("=" * 70)
    print()

    print("1. Deriving auth key from password with PBKDF2 (1,048,576 iterations)...")
    start_time = time.time()
    derive_result = api_request("/auth-key/derive", {
        "password": "MySecretPassword123!",
        "iterations": 1 << 20
    })
    elapsed = time.time() - start_time
    print(f"   ✅ Key derived successfully!")
    print(f"   Password: 'MySecretPassword123!'")
    print(f"   Iterations: {derive_result['iterations_readable']}")
    print(f"   Salt: {derive_result['salt_hex'][:16]}...")
    print(f"   Auth Key ID: {derive_result['auth_key_id']}")
    print(f"   Derivation time: {elapsed:.2f}s")
    print()

    print("2. Verifying same password + salt produces same key...")
    derive_result2 = api_request("/auth-key/derive", {
        "password": "MySecretPassword123!",
        "salt": derive_result["salt_hex"],
        "iterations": 1 << 20
    })
    is_match = derive_result["auth_key_hex"] == derive_result2["auth_key_hex"]
    print(f"   Keys match: {'✅ YES' if is_match else '❌ NO'}")
    print()

    print("3. Testing different password produces different key...")
    derive_result3 = api_request("/auth-key/derive", {
        "password": "DifferentPassword!",
        "salt": derive_result["salt_hex"],
        "iterations": 1 << 20
    })
    is_different = derive_result["auth_key_hex"] != derive_result3["auth_key_hex"]
    print(f"   Keys different: {'✅ YES' if is_different else '❌ NO'}")
    print()

    print("=" * 70)
    print("PART 2: Message ID Replay Protection")
    print("=" * 70)
    print()

    print("4. Checking replay protection status...")
    status = api_get("/replay-protection/status")
    print(f"   Replay protection enabled: {'✅ YES' if status['enabled'] else '❌ NO'}")
    print()

    print("5. Generating test encrypted message...")
    encrypt_result = api_request("/encrypt-test", {
        "message": "Test message for replay protection"
    })
    print(f"   ✅ Generated test message")
    print(f"   Message ID: {encrypt_result['message_id']}")
    print(f"   Session ID: {encrypt_result['session_id_hex']}")
    print()

    print("6. First decryption attempt (should pass)...")
    decrypt1 = api_request("/decrypt-full", {
        "data": encrypt_result["full_data_hex"],
        "auth_key": encrypt_result["auth_key_hex"],
        "is_client": True
    })
    print(f"   Replay check passed: {'✅ YES' if decrypt1['replay_protection']['passed'] else '❌ NO'}")
    print(f"   Reason: {decrypt1['replay_protection']['reason']}")
    print(f"   Messages found: {len(decrypt1['messages'])}")
    if decrypt1['session_stats']:
        print(f"   Session message count: {decrypt1['session_stats']['message_count']}")
        print(f"   Replay detected count: {decrypt1['session_stats']['replay_detected']}")
    print()

    print("7. Second decryption attempt (SAME message - replay attack simulation)...")
    try:
        decrypt2 = api_request("/decrypt-full", {
            "data": encrypt_result["full_data_hex"],
            "auth_key": encrypt_result["auth_key_hex"],
            "is_client": True
        })
        replay_passed = decrypt2['replay_protection']['passed']
        status_text = "✅ YES (protection off or strict=False)" if replay_passed else "❌ NO (correctly rejected)"
        print(f"   Replay check passed: {status_text}")
        print(f"   Reason: {decrypt2['replay_protection']['reason']}")
        if decrypt2['session_stats']:
            print(f"   Session message count: {decrypt2['session_stats']['message_count']}")
            print(f"   Replay detected count: {decrypt2['session_stats']['replay_detected']}")
    except Exception as e:
        print(f"   ✅ Correctly rejected with error: {e}")
    print()

    print("8. Listing active sessions...")
    sessions = api_get("/sessions")
    print(f"   Active sessions: {sessions['count']}")
    for sess in sessions["sessions"]:
        print(f"   - Auth Key ID: {sess['auth_key_id']}")
        print(f"     Session ID: {sess['session_id_hex']}")
        if sess.get('stats'):
            print(f"     Messages: {sess['stats']['message_count']}, Replays: {sess['stats']['replay_detected']}")
    print()

    print("9. Clearing all sessions...")
    clear_result = api_request("/sessions/clear", {})
    print(f"   Cleared sessions: {clear_result['cleared_count']}")
    print()

    print("10. Verifying sessions cleared...")
    sessions_after = api_get("/sessions")
    print(f"   Active sessions after clear: {sessions_after['count']}")
    print()

    print("=" * 70)
    print("✅ ALL SECURITY FEATURE TESTS COMPLETED!")
    print("=" * 70)

if __name__ == "__main__":
    main()
