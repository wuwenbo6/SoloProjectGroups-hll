#!/usr/bin/env python3
import os
import sys
import json
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from transport import TransportParser, TransportType
from crypto import MTProtoCrypto, AESIGE
from tl_parser import parse_tl_message


def test_aes_ige():
    print("=" * 60)
    print("Testing AES-IGE Encryption/Decryption")
    print("=" * 60)

    key = os.urandom(32)
    iv = os.urandom(32)
    plaintext = b"Hello, MTProto AES-IGE! " * 4

    if len(plaintext) % 16 != 0:
        padding = 16 - (len(plaintext) % 16)
        plaintext += b"\x00" * padding

    encrypted = AESIGE.encrypt(plaintext, key, iv)
    decrypted = AESIGE.decrypt(encrypted, key, iv)

    assert decrypted == plaintext, f"AES-IGE test failed: {decrypted} != {plaintext}"
    print("✅ AES-IGE encryption/decryption works correctly")
    print(f"   Plaintext length: {len(plaintext)} bytes")
    print(f"   Ciphertext length: {len(encrypted)} bytes")
    print()


def test_crypto_module():
    print("=" * 60)
    print("Testing MTProto Crypto Module")
    print("=" * 60)

    auth_key = MTProtoCrypto.generate_auth_key()
    print(f"Generated auth key: {len(auth_key)} bytes")
    print(f"Auth key ID: {MTProtoCrypto(auth_key).auth_key_id}")

    crypto = MTProtoCrypto(auth_key)

    salt = os.urandom(8)
    session_id = os.urandom(8)
    message_id = int(time.time() * 2**32)
    seq_no = 1

    test_message = b"Test message for MTProto encryption"

    message_key, encrypted = crypto.encrypt_message(
        test_message, salt, session_id, message_id, seq_no
    )

    print(f"Message key: {message_key.hex()}")
    print(f"Encrypted data length: {len(encrypted)} bytes")

    decrypted = crypto.decrypt_message(encrypted, message_key)

    assert decrypted["message_data"] == test_message, \
        f"Decryption failed: {decrypted['message_data']} != {test_message}"
    assert decrypted["salt"] == salt
    assert decrypted["session_id"] == session_id
    assert decrypted["message_id"] == message_id
    assert decrypted["seq_no"] == seq_no
    assert decrypted["is_valid"], "Message key validation failed"

    print("✅ MTProto encryption/decryption works correctly")
    print(f"   Message ID: {decrypted['message_id']}")
    print(f"   Seq No: {decrypted['seq_no']}")
    print(f"   Message data: {decrypted['message_data']}")
    print(f"   Integrity check: {decrypted['is_valid']}")
    print()


def test_transport_parser():
    print("=" * 60)
    print("Testing Transport Parser")
    print("=" * 60)

    auth_key = MTProtoCrypto.generate_auth_key()
    crypto = MTProtoCrypto(auth_key)

    test_data = b"Test transport packet data padded to 16 bytes"
    if len(test_data) % 16 != 0:
        test_data += b"\x00" * (16 - len(test_data) % 16)

    salt = os.urandom(8)
    session_id = os.urandom(8)
    message_id = int(time.time() * 2**32)
    seq_no = 1

    message_key, encrypted = crypto.encrypt_message(
        test_data, salt, session_id, message_id, seq_no
    )

    packet = (
        crypto.auth_key_id.to_bytes(8, "little") +
        message_key +
        encrypted
    )

    transport_parser = TransportParser()

    abridged_data = b"\xef" + ((len(packet) // 4).to_bytes(1, "little")) + packet
    transport_type = transport_parser.detect_transport_type(abridged_data)
    assert transport_type == TransportType.ABRIDGED
    parsed = transport_parser.parse_tcp_abridged(abridged_data)
    assert parsed == packet
    print("✅ TCP Abridged transport parsing works")

    intermediate_data = b"\xee\xee\xee\xee" + len(packet).to_bytes(4, "little") + packet
    transport_type = transport_parser.detect_transport_type(intermediate_data)
    assert transport_type == TransportType.INTERMEDIATE
    parsed = transport_parser.parse_tcp_intermediate(intermediate_data)
    assert parsed == packet
    print("✅ TCP Intermediate transport parsing works")

    padded_data = b"\xdd\xdd\xdd\xdd" + len(packet).to_bytes(4, "little") + packet
    padding = (4 - (len(packet) % 4)) % 4
    if padding > 0:
        padded_data += b"\x00" * padding
    transport_type = transport_parser.detect_transport_type(padded_data)
    assert transport_type == TransportType.PADDED_INTERMEDIATE
    parsed = transport_parser.parse_tcp_intermediate(padded_data, padded=True)
    assert parsed == packet
    print("✅ TCP Padded Intermediate transport parsing works")

    http_request = (
        b"POST /api HTTP/1.1\r\n"
        b"Host: example.com\r\n"
        b"Content-Length: " + str(len(packet)).encode() + b"\r\n"
        b"\r\n" +
        packet
    )
    transport_type = transport_parser.detect_transport_type(http_request)
    assert transport_type == TransportType.HTTP
    parsed_body, headers = transport_parser.parse_http(http_request)
    assert parsed_body == packet
    print("✅ HTTP transport parsing works")

    print()


def test_tl_parser():
    print("=" * 60)
    print("Testing TL Parser")
    print("=" * 60)

    from tl_parser import TLParser

    test_cases = [
        {
            "name": "Bool True",
            "data": b"\x5f\xec\x0f\xbc",
            "expected": True
        },
        {
            "name": "Bool False",
            "data": b"\xaa\x79\x97\x37",
            "expected": False
        },
        {
            "name": "Vector of ints",
            "data": b"\x15\xc4\xb5\x1c" + b"\x03\x00\x00\x00" +
                    b"\x01\x00\x00\x00" + b"\x02\x00\x00\x00" + b"\x03\x00\x00\x00",
            "check": lambda x: isinstance(x, dict) and x.get("_") == "vector" and len(x.get("items", [])) == 3
        },
    ]

    for test in test_cases:
        print(f"Testing: {test['name']}...")
        result = parse_tl_message(test["data"])

        if "expected" in test:
            assert result["parsed"] == test["expected"], \
                f"Failed: {result['parsed']} != {test['expected']}"
        elif "check" in test:
            assert test["check"](result["parsed"]), f"Failed check for {test['name']}"

        print(f"   ✅ Passed: {result['parsed']}")

    print(f"\nTesting: String...")
    parser = TLParser(b"\x0bHello World" + b"\x00\x00\x00")
    result = parser.read_string()
    assert result == "Hello World", f"Failed: {result} != 'Hello World'"
    print(f"   ✅ Passed: {result}")

    print(f"\nTesting: Int...")
    parser = TLParser(b"\x2a\x00\x00\x00")
    result = parser.read_uint()
    assert result == 42, f"Failed: {result} != 42"
    print(f"   ✅ Passed: {result}")

    print(f"\nTesting: Long...")
    parser = TLParser(b"\x01\x02\x03\x04\x05\x06\x07\x08")
    result = parser.read_ulong()
    assert result == 0x0807060504030201, f"Failed: {hex(result)}"
    print(f"   ✅ Passed: {hex(result)}")

    print()


def test_full_pipeline():
    print("=" * 60)
    print("Testing Full Pipeline")
    print("=" * 60)

    auth_key = MTProtoCrypto.generate_auth_key()
    crypto = MTProtoCrypto(auth_key)

    message_text = "你好，这是一条测试消息！Hello, this is a test message!"

    tl_data = b""
    tl_data += (0x952c0494).to_bytes(4, "little")
    tl_data += (0x5bb8e511).to_bytes(4, "little")

    flags = (1 << 1) | (1 << 0)
    tl_data += flags.to_bytes(4, "little")
    tl_data += (12345).to_bytes(4, "little")

    tl_data += (0x65c66937).to_bytes(4, "little")
    tl_data += (123456789).to_bytes(8, "little")

    tl_data += (0x65c66937).to_bytes(4, "little")
    tl_data += (987654321).to_bytes(8, "little")

    tl_data += int(time.time()).to_bytes(4, "little")

    msg_bytes = message_text.encode("utf-8")
    if len(msg_bytes) < 254:
        tl_data += len(msg_bytes).to_bytes(1, "little")
        tl_data += msg_bytes
        padding = (4 - (len(msg_bytes) + 1) % 4) % 4
        if padding > 0:
            tl_data += b"\x00" * padding
    else:
        tl_data += b"\xfe"
        tl_data += len(msg_bytes).to_bytes(3, "little")
        tl_data += msg_bytes
        padding = (4 - (len(msg_bytes) + 3) % 4) % 4
        if padding > 0:
            tl_data += b"\x00" * padding

    tl_data += (1).to_bytes(4, "little")
    tl_data += (1).to_bytes(4, "little")

    print(f"TL data length: {len(tl_data)} bytes")

    salt = os.urandom(8)
    session_id = os.urandom(8)
    message_id = int(time.time() * 2**32)
    seq_no = 1

    message_key, encrypted = crypto.encrypt_message(
        tl_data, salt, session_id, message_id, seq_no
    )

    packet = (
        crypto.auth_key_id.to_bytes(8, "little") +
        message_key +
        encrypted
    )

    transport_data = b"\xef" + ((len(packet) // 4).to_bytes(1, "little")) + packet

    print(f"Full transport packet length: {len(transport_data)} bytes")
    print(f"Transport data (first 64 bytes): {transport_data[:64].hex()}")

    parser = TransportParser()
    transport_type = parser.detect_transport_type(transport_data)
    print(f"Detected transport type: {transport_type}")

    parsed_packet = parser.parse(transport_data, transport_type)
    print(f"Parsed packet length: {len(parsed_packet)} bytes")

    packet_auth_key_id, pkt_message_key, encrypted_data = parser.split_packet(parsed_packet)
    print(f"Packet auth key ID: {packet_auth_key_id}")
    print(f"Expected auth key ID: {crypto.auth_key_id}")

    assert packet_auth_key_id == crypto.auth_key_id, "Auth key ID mismatch"
    assert pkt_message_key == message_key, "Message key mismatch"

    decrypted = crypto.decrypt_message(encrypted_data, message_key)
    print(f"Decrypted message length: {decrypted['message_length']} bytes")
    print(f"Integrity check: {decrypted['is_valid']}")

    assert decrypted["is_valid"], "Message integrity check failed"

    tl_result = parse_tl_message(decrypted["message_data"])
    print(f"\nParsed TL structure:")
    print(json.dumps(tl_result["parsed"], indent=2, ensure_ascii=False, default=str))

    messages = tl_result["messages"]
    print(f"\nExtracted messages: {len(messages)}")
    for msg in messages:
        print(f"\nMessage ID: {msg.get('id')}")
        print(f"Message type: {msg.get('type')}")
        print(f"Message text: {msg.get('message')}")
        print(f"Date: {msg.get('date')}")
        print(f"Chat: {msg.get('chat')}")
        print(f"Sender: {msg.get('sender')}")

    assert len(messages) > 0, "No messages extracted"
    assert messages[0].get("message") == message_text, "Message text mismatch"

    print("\n✅ Full pipeline test passed!")
    print()


def generate_sample_data():
    print("=" * 60)
    print("Generating Sample Data")
    print("=" * 60)

    auth_key = MTProtoCrypto.generate_auth_key()
    crypto = MTProtoCrypto(auth_key)

    messages = [
        "Hello, Telegram!",
        "你好，世界！",
        "Testing MTProto message parser",
        "This is a secret message 🔒",
        "Привет из MTProto!"
    ]

    sample_data = []

    for i, msg_text in enumerate(messages):
        tl_data = b""
        tl_data += (0x952c0494).to_bytes(4, "little")
        tl_data += (0x5bb8e511).to_bytes(4, "little")

        flags = (1 << 1) | (1 << 0)
        tl_data += flags.to_bytes(4, "little")
        tl_data += (1000 + i).to_bytes(4, "little")

        tl_data += (0x65c66937).to_bytes(4, "little")
        tl_data += (123456789).to_bytes(8, "little")

        tl_data += (0x65c66937).to_bytes(4, "little")
        tl_data += (987654321).to_bytes(8, "little")

        tl_data += int(time.time() + i).to_bytes(4, "little")

        msg_bytes = msg_text.encode("utf-8")
        if len(msg_bytes) < 254:
            tl_data += len(msg_bytes).to_bytes(1, "little")
            tl_data += msg_bytes
            padding = (4 - (len(msg_bytes) + 1) % 4) % 4
            if padding > 0:
                tl_data += b"\x00" * padding
        else:
            tl_data += b"\xfe"
            tl_data += len(msg_bytes).to_bytes(3, "little")
            tl_data += msg_bytes
            padding = (4 - (len(msg_bytes) + 3) % 4) % 4
            if padding > 0:
                tl_data += b"\x00" * padding

        tl_data += (1).to_bytes(4, "little")
        tl_data += (1).to_bytes(4, "little")

        salt = os.urandom(8)
        session_id = os.urandom(8)
        message_id = int((time.time() + i) * 2**32)
        seq_no = i + 1

        message_key, encrypted = crypto.encrypt_message(
            tl_data, salt, session_id, message_id, seq_no
        )

        packet = (
            crypto.auth_key_id.to_bytes(8, "little") +
            message_key +
            encrypted
        )

        transport_data = b"\xef" + ((len(packet) // 4).to_bytes(1, "little")) + packet

        sample_data.append({
            "message": msg_text,
            "auth_key_hex": auth_key.hex(),
            "full_data_hex": transport_data.hex(),
            "message_id": message_id,
            "seq_no": seq_no
        })

    output_file = os.path.join(os.path.dirname(__file__), "sample_messages.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({
            "auth_key_hex": auth_key.hex(),
            "auth_key_id": crypto.auth_key_id,
            "samples": sample_data
        }, f, indent=2, ensure_ascii=False)

    print(f"✅ Generated {len(sample_data)} sample messages")
    print(f"   Saved to: {output_file}")
    print(f"   Auth key: {auth_key.hex()[:64]}...")
    print()


def main():
    print("\n" + "=" * 60)
    print("MTProto Parser Test Suite")
    print("=" * 60 + "\n")

    try:
        test_aes_ige()
        test_crypto_module()
        test_transport_parser()
        test_tl_parser()
        test_full_pipeline()
        generate_sample_data()

        print("=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("=" * 60)
        print("\nYou can now run the server with:")
        print("  cd backend && python app.py")
        print("\nThen open http://localhost:5000 in your browser")

    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
