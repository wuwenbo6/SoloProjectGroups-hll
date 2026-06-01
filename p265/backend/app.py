import os
import json
import base64
import time
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS

from transport import TransportParser, TransportType
from crypto import MTProtoCrypto, AESIGE
from tl_parser import parse_tl_message
from session_manager import get_global_session_manager
from exporter import ChatExporter

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)

AUTH_KEYS = {}
session_manager = get_global_session_manager()
REPLAY_PROTECTION_ENABLED = True


@app.route("/")
def index():
    return send_from_directory("../frontend", "index.html")


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "timestamp": int(time.time()),
        "datetime": datetime.now().isoformat()
    })


@app.route("/api/transport/detect", methods=["POST"])
def detect_transport():
    try:
        data = request.get_json()
        hex_data = data.get("data", "")
        raw_data = bytes.fromhex(hex_data) if hex_data else b""

        if not raw_data:
            return jsonify({"error": "No data provided"}), 400

        transport_type = TransportParser.detect_transport_type(raw_data)

        return jsonify({
            "transport_type": transport_type.value,
            "description": _get_transport_description(transport_type)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/transport/parse", methods=["POST"])
def parse_transport():
    try:
        data = request.get_json()
        hex_data = data.get("data", "")
        transport_type_str = data.get("transport_type")
        raw_data = bytes.fromhex(hex_data) if hex_data else b""

        if not raw_data:
            return jsonify({"error": "No data provided"}), 400

        parser = TransportParser()

        if transport_type_str:
            transport_type = TransportType(transport_type_str)
        else:
            transport_type = parser.detect_transport_type(raw_data)

        parsed_data = parser.parse(raw_data, transport_type)

        if len(parsed_data) >= 24:
            auth_key_id, message_key, encrypted_data = parser.split_packet(parsed_data)
        else:
            auth_key_id = None
            message_key = None
            encrypted_data = parsed_data

        return jsonify({
            "transport_type": transport_type.value,
            "parsed_data_hex": parsed_data.hex(),
            "parsed_data_length": len(parsed_data),
            "auth_key_id": auth_key_id,
            "message_key_hex": message_key.hex() if message_key else None,
            "encrypted_data_hex": encrypted_data.hex() if encrypted_data else None
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/crypto/decrypt", methods=["POST"])
def decrypt_message():
    try:
        data = request.get_json()
        encrypted_hex = data.get("encrypted_data", "")
        message_key_hex = data.get("message_key", "")
        auth_key_hex = data.get("auth_key", "")
        is_client = data.get("is_client", True)
        auth_key_id = data.get("auth_key_id")

        if not encrypted_hex or not message_key_hex or not auth_key_hex:
            return jsonify({"error": "Missing required parameters"}), 400

        encrypted_data = bytes.fromhex(encrypted_hex)
        message_key = bytes.fromhex(message_key_hex)
        auth_key = bytes.fromhex(auth_key_hex)

        if len(auth_key) != 256:
            return jsonify({"error": "Auth key must be 256 bytes (512 hex characters)"}), 400

        crypto = MTProtoCrypto(auth_key)

        if auth_key_id and str(crypto.auth_key_id) != str(auth_key_id):
            return jsonify({
                "error": "Auth key ID mismatch",
                "expected": crypto.auth_key_id,
                "provided": auth_key_id
            }), 400

        decrypted_result = crypto.decrypt_message(
            encrypted_data,
            message_key,
            is_client=is_client
        )

        return jsonify({
            "salt_hex": decrypted_result["salt"].hex(),
            "session_id_hex": decrypted_result["session_id"].hex(),
            "message_id": decrypted_result["message_id"],
            "seq_no": decrypted_result["seq_no"],
            "message_length": decrypted_result["message_length"],
            "message_data_hex": decrypted_result["message_data"].hex(),
            "is_valid": decrypted_result["is_valid"],
            "decrypted_full_hex": decrypted_result["decrypted_full"].hex()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/tl/parse", methods=["POST"])
def parse_tl():
    try:
        data = request.get_json()
        hex_data = data.get("data", "")
        raw_data = bytes.fromhex(hex_data) if hex_data else b""

        if not raw_data:
            return jsonify({"error": "No data provided"}), 400

        result = parse_tl_message(raw_data)

        return jsonify({
            "parsed": result["parsed"],
            "messages": result["messages"],
            "remaining_bytes": result["remaining_bytes"]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/decrypt-full", methods=["POST"])
def decrypt_full():
    try:
        data = request.get_json()
        input_data = data.get("data", "")
        auth_key_hex = data.get("auth_key", "")
        is_client = data.get("is_client", True)
        transport_type_str = data.get("transport_type")

        if not input_data or not auth_key_hex:
            return jsonify({"error": "Missing required parameters"}), 400

        try:
            raw_data = bytes.fromhex(input_data)
        except ValueError:
            try:
                raw_data = base64.b64decode(input_data)
            except ValueError:
                return jsonify({"error": "Data must be hex or base64 encoded"}), 400

        if len(raw_data) < 24:
            return jsonify({"error": "Data too short"}), 400

        auth_key = bytes.fromhex(auth_key_hex)
        if len(auth_key) != 256:
            return jsonify({"error": "Auth key must be 256 bytes (512 hex characters)"}), 400

        parser = TransportParser()

        if transport_type_str:
            transport_type = TransportType(transport_type_str)
        else:
            try:
                transport_type = parser.detect_transport_type(raw_data)
            except ValueError:
                transport_type = None

        if transport_type:
            try:
                parsed_packet = parser.parse(raw_data, transport_type)
            except Exception:
                parsed_packet = raw_data
        else:
            parsed_packet = raw_data

        if len(parsed_packet) < 24:
            return jsonify({"error": "Parsed packet too short"}), 400

        packet_auth_key_id, message_key, encrypted_data = parser.split_packet(parsed_packet)

        crypto = MTProtoCrypto(auth_key)

        if packet_auth_key_id != 0 and packet_auth_key_id != crypto.auth_key_id:
            return jsonify({
                "error": "Auth key ID mismatch",
                "expected": crypto.auth_key_id,
                "packet_auth_key_id": packet_auth_key_id
            }), 400

        try:
            decrypted = crypto.decrypt_message(encrypted_data, message_key, is_client=is_client)
        except Exception as e:
            return jsonify({
                "error": f"Decryption failed: {str(e)}",
                "transport_type": transport_type.value if transport_type else None,
                "packet_auth_key_id": packet_auth_key_id,
                "message_key_hex": message_key.hex()
            }), 500

        replay_check = {
            "enabled": REPLAY_PROTECTION_ENABLED,
            "passed": True,
            "reason": "N/A"
        }

        if REPLAY_PROTECTION_ENABLED:
            msg_id = decrypted["message_id"]
            session_id = decrypted["session_id"]
            is_valid, reason = session_manager.check_and_record_msg_id(
                crypto.auth_key_id, session_id, msg_id, strict=False
            )
            replay_check["passed"] = is_valid
            replay_check["reason"] = reason

            session_stats = session_manager.get_session_stats(
                crypto.auth_key_id, session_id
            )
        else:
            session_stats = None

        tl_result = parse_tl_message(decrypted["message_data"])

        return jsonify({
            "transport_type": transport_type.value if transport_type else "unknown",
            "packet_auth_key_id": packet_auth_key_id,
            "message_key_hex": message_key.hex(),
            "salt_hex": decrypted["salt"].hex(),
            "session_id_hex": decrypted["session_id"].hex(),
            "message_id": decrypted["message_id"],
            "message_id_hex": decrypted["message_id"].to_bytes(8, "little").hex(),
            "seq_no": decrypted["seq_no"],
            "message_length": decrypted["message_length"],
            "is_valid": decrypted["is_valid"],
            "replay_protection": replay_check,
            "session_stats": session_stats,
            "tl_parsed": tl_result["parsed"],
            "messages": tl_result["messages"],
            "users": tl_result["users"],
            "chats": tl_result["chats"],
            "remaining_bytes": tl_result["remaining_bytes"],
            "message_data_hex": decrypted["message_data"].hex()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auth-key/add", methods=["POST"])
def add_auth_key():
    try:
        data = request.get_json()
        name = data.get("name", "default")
        auth_key_hex = data.get("auth_key", "")

        if not auth_key_hex:
            return jsonify({"error": "Auth key required"}), 400

        auth_key = bytes.fromhex(auth_key_hex)
        if len(auth_key) != 256:
            return jsonify({"error": "Auth key must be 256 bytes"}), 400

        crypto = MTProtoCrypto(auth_key)
        AUTH_KEYS[name] = {
            "auth_key_hex": auth_key_hex,
            "auth_key_id": crypto.auth_key_id
        }

        return jsonify({
            "name": name,
            "auth_key_id": crypto.auth_key_id,
            "status": "added"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auth-key/list", methods=["GET"])
def list_auth_keys():
    return jsonify({
        "keys": [
            {
                "name": name,
                "auth_key_id": info["auth_key_id"]
            }
            for name, info in AUTH_KEYS.items()
        ]
    })


@app.route("/api/decrypt-with-key", methods=["POST"])
def decrypt_with_key():
    try:
        data = request.get_json()
        key_name = data.get("key_name", "default")
        input_data = data.get("data", "")
        is_client = data.get("is_client", True)
        transport_type_str = data.get("transport_type")

        if key_name not in AUTH_KEYS:
            return jsonify({"error": f"Auth key '{key_name}' not found"}), 404

        auth_key_hex = AUTH_KEYS[key_name]["auth_key_hex"]

        decrypt_request = {
            "data": input_data,
            "auth_key": auth_key_hex,
            "is_client": is_client,
            "transport_type": transport_type_str
        }

        with app.test_request_context():
            request.get_json = lambda: decrypt_request
            return decrypt_full()

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/encrypt-test", methods=["POST"])
def encrypt_test():
    try:
        data = request.get_json()
        message_text = data.get("message", "Hello, Telegram!")
        auth_key_hex = data.get("auth_key", "")

        if not auth_key_hex:
            auth_key = MTProtoCrypto.generate_auth_key()
            auth_key_hex = auth_key.hex()
        else:
            auth_key = bytes.fromhex(auth_key_hex)

        crypto = MTProtoCrypto(auth_key)

        tl_data = _build_test_message_tl(message_text)

        import os
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

        transport_header = b"\xef"
        length = len(packet)
        if length % 4 != 0:
            packet += os.urandom(4 - (length % 4))
            length = len(packet)

        length_encoded = (length // 4).to_bytes(1, "little") if length // 4 < 127 else \
            b"\x7f" + (length // 4).to_bytes(3, "little")

        full_data = transport_header + length_encoded + packet

        return jsonify({
            "auth_key_hex": auth_key_hex,
            "auth_key_id": crypto.auth_key_id,
            "message_id": message_id,
            "message_text": message_text,
            "full_data_hex": full_data.hex(),
            "packet_hex": packet.hex(),
            "encrypted_data_hex": encrypted.hex(),
            "message_key_hex": message_key.hex(),
            "salt_hex": salt.hex(),
            "session_id_hex": session_id.hex(),
            "seq_no": seq_no
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _get_transport_description(transport_type: TransportType) -> str:
    descriptions = {
        TransportType.ABRIDGED: "TCP Abridged transport (0xef header)",
        TransportType.INTERMEDIATE: "TCP Intermediate transport (0xee header)",
        TransportType.PADDED_INTERMEDIATE: "TCP Padded Intermediate transport (0xdd header)",
        TransportType.FULL: "TCP Full transport (with CRC32)",
        TransportType.HTTP: "HTTP/WebSocket transport"
    }
    return descriptions.get(transport_type, "Unknown transport")


@app.route("/api/auth-key/derive", methods=["POST"])
def derive_auth_key():
    try:
        data = request.get_json()
        password = data.get("password", "")
        salt_hex = data.get("salt", "")
        iterations = data.get("iterations", 1 << 20)

        if not password:
            return jsonify({"error": "Password is required"}), 400

        if iterations < 10000:
            return jsonify({"error": "Iterations must be at least 10000"}), 400

        salt = bytes.fromhex(salt_hex) if salt_hex else None

        import time
        start_time = time.time()

        auth_key, salt = MTProtoCrypto.derive_auth_key_from_password(
            password, salt, iterations
        )

        elapsed = time.time() - start_time

        crypto = MTProtoCrypto(auth_key)

        return jsonify({
            "auth_key_hex": auth_key.hex(),
            "auth_key_id": crypto.auth_key_id,
            "salt_hex": salt.hex(),
            "iterations": iterations,
            "iterations_readable": f"{iterations:,}",
            "derivation_time_seconds": round(elapsed, 3)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sessions", methods=["GET"])
def list_sessions():
    try:
        sessions = session_manager.get_all_sessions()
        return jsonify({
            "count": len(sessions),
            "sessions": sessions
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sessions/stats", methods=["POST"])
def get_session_stats():
    try:
        data = request.get_json()
        auth_key_id = data.get("auth_key_id")
        session_id_hex = data.get("session_id", "")

        if auth_key_id is None or not session_id_hex:
            return jsonify({"error": "auth_key_id and session_id are required"}), 400

        session_id = bytes.fromhex(session_id_hex)
        stats = session_manager.get_session_stats(auth_key_id, session_id)

        if not stats:
            return jsonify({"error": "Session not found"}), 404

        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sessions/clear", methods=["POST"])
def clear_sessions():
    try:
        count = session_manager.clear_all_sessions()
        return jsonify({
            "cleared_count": count,
            "status": "success"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/replay-protection/toggle", methods=["POST"])
def toggle_replay_protection():
    global REPLAY_PROTECTION_ENABLED
    try:
        data = request.get_json()
        enabled = data.get("enabled", True)
        REPLAY_PROTECTION_ENABLED = bool(enabled)
        return jsonify({
            "replay_protection_enabled": REPLAY_PROTECTION_ENABLED,
            "status": "success"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/replay-protection/status", methods=["GET"])
def replay_protection_status():
    return jsonify({
        "enabled": REPLAY_PROTECTION_ENABLED
    })


@app.route("/api/export", methods=["POST"])
def export_chat():
    try:
        data = request.get_json()
        input_data = data.get("data", "")
        auth_key_hex = data.get("auth_key", "")
        is_client = data.get("is_client", True)
        transport_type_str = data.get("transport_type")
        export_format = data.get("format", "json")

        if not input_data or not auth_key_hex:
            return jsonify({"error": "Missing required parameters"}), 400

        try:
            raw_data = bytes.fromhex(input_data)
        except ValueError:
            try:
                raw_data = base64.b64decode(input_data)
            except ValueError:
                return jsonify({"error": "Data must be hex or base64 encoded"}), 400

        auth_key = bytes.fromhex(auth_key_hex)
        if len(auth_key) != 256:
            return jsonify({"error": "Auth key must be 256 bytes"}), 400

        parser = TransportParser()

        if transport_type_str:
            transport_type = TransportType(transport_type_str)
        else:
            try:
                transport_type = parser.detect_transport_type(raw_data)
            except ValueError:
                transport_type = None

        if transport_type:
            try:
                parsed_packet = parser.parse(raw_data, transport_type)
            except Exception:
                parsed_packet = raw_data
        else:
            parsed_packet = raw_data

        if len(parsed_packet) < 24:
            return jsonify({"error": "Parsed packet too short"}), 400

        packet_auth_key_id, message_key, encrypted_data = parser.split_packet(parsed_packet)
        crypto = MTProtoCrypto(auth_key)

        try:
            decrypted = crypto.decrypt_message(encrypted_data, message_key, is_client=is_client)
        except Exception as e:
            return jsonify({"error": f"Decryption failed: {str(e)}"}), 500

        tl_result = parse_tl_message(decrypted["message_data"])

        messages = tl_result["messages"]
        users = tl_result["users"]
        chats = tl_result["chats"]

        metadata = {
            "transport_type": transport_type.value if transport_type else "unknown",
            "session_id": decrypted["session_id"].hex(),
            "is_valid": decrypted["is_valid"],
            "message_count": len(messages)
        }

        if export_format == "csv":
            content = ChatExporter.to_csv(messages)
            return Response(
                content,
                mimetype="text/csv",
                headers={"Content-Disposition": "attachment; filename=chat_export.csv"}
            )
        elif export_format == "html":
            content = ChatExporter.to_html(messages, users, chats, metadata)
            return Response(
                content,
                mimetype="text/html",
                headers={"Content-Disposition": "attachment; filename=chat_export.html"}
            )
        else:
            content = ChatExporter.to_json(messages, users, chats, metadata)
            return Response(
                content,
                mimetype="application/json",
                headers={"Content-Disposition": "attachment; filename=chat_export.json"}
            )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/export-from-result", methods=["POST"])
def export_from_result():
    try:
        data = request.get_json()
        messages = data.get("messages", [])
        users = data.get("users", {})
        chats = data.get("chats", {})
        export_format = data.get("format", "json")
        metadata = data.get("metadata", {})

        if not messages:
            return jsonify({"error": "No messages to export"}), 400

        if export_format == "csv":
            content = ChatExporter.to_csv(messages)
            return Response(
                content,
                mimetype="text/csv",
                headers={"Content-Disposition": "attachment; filename=chat_export.csv"}
            )
        elif export_format == "html":
            content = ChatExporter.to_html(messages, users, chats, metadata)
            return Response(
                content,
                mimetype="text/html",
                headers={"Content-Disposition": "attachment; filename=chat_export.html"}
            )
        else:
            content = ChatExporter.to_json(messages, users, chats, metadata)
            return Response(
                content,
                mimetype="application/json",
                headers={"Content-Disposition": "attachment; filename=chat_export.json"}
            )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _build_test_message_tl(message_text: str) -> bytes:
    data = b""

    data += (0x952c0494).to_bytes(4, "little")
    data += (0x5bb8e511).to_bytes(4, "little")

    flags = (1 << 1) | (1 << 0)
    data += flags.to_bytes(4, "little")
    data += (12345).to_bytes(4, "little")

    data += (0x65c66937).to_bytes(4, "little")
    data += (123456789).to_bytes(8, "little")

    data += (0x65c66937).to_bytes(4, "little")
    data += (987654321).to_bytes(8, "little")

    data += int(time.time()).to_bytes(4, "little")

    msg_bytes = message_text.encode("utf-8")
    if len(msg_bytes) < 254:
        data += len(msg_bytes).to_bytes(1, "little")
        data += msg_bytes
        padding = (4 - (len(msg_bytes) + 1) % 4) % 4
        if padding > 0:
            data += b"\x00" * padding
    else:
        data += b"\xfe"
        data += len(msg_bytes).to_bytes(3, "little")
        data += msg_bytes
        padding = (4 - (len(msg_bytes) + 3) % 4) % 4
        if padding > 0:
            data += b"\x00" * padding

    data += (1).to_bytes(4, "little")
    data += (1).to_bytes(4, "little")

    user_flags = (1 << 1) | (1 << 0) | (1 << 10)
    data += user_flags.to_bytes(4, "little")
    data += (123456789).to_bytes(8, "little")
    data += (999888777).to_bytes(8, "little")

    first_name = "Test".encode("utf-8")
    data += len(first_name).to_bytes(1, "little")
    data += first_name
    padding = (4 - (len(first_name) + 1) % 4) % 4
    if padding > 0:
        data += b"\x00" * padding

    data += (0).to_bytes(4, "little")
    data += (0).to_bytes(4, "little")

    return data


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"MTProto Message Parser Server starting on port {port}...")
    print(f"Open http://localhost:{port} to access the interface")
    app.run(host="0.0.0.0", port=port, debug=True)
