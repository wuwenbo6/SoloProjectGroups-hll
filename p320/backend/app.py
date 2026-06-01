from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from zrtp_engine import ZRTPEngine, AlgorithmType
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)

engine = ZRTPEngine()


@app.route("/api/zrtp/negotiate", methods=["POST"])
def negotiate():
    data = request.get_json(silent=True) or {}
    algorithm = data.get("algorithm", "DH2048")
    simulate_mitm = data.get("simulate_mitm", False)
    if algorithm not in ("DH2048", "ECDH_P256"):
        return jsonify({"error": "Invalid algorithm. Use DH2048 or ECDH_P256"}), 400

    result = engine.negotiate(algorithm, simulate_mitm=simulate_mitm)
    return jsonify(result)


@app.route("/api/zrtp/goclear", methods=["POST"])
def goclear():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    sender = data.get("sender", "alice")
    reason = data.get("reason", "User requested")

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400
    if sender not in ("alice", "bob"):
        return jsonify({"error": "sender must be 'alice' or 'bob'"}), 400

    try:
        result = engine.goclear(session_id, sender, user_confirmed=False, reason=reason)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@app.route("/api/zrtp/goclear/confirm", methods=["POST"])
def goclear_confirm():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id")
    sender = data.get("sender", "alice")
    reason = data.get("reason", "User requested")
    confirm = data.get("confirm", False)

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400
    if not confirm:
        return jsonify({"error": "User confirmation required"}), 400

    try:
        result = engine.goclear(session_id, sender, user_confirmed=True, reason=reason)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@app.route("/api/zrtp/export/<session_id>", methods=["GET"])
def export_session(session_id):
    include_keys = request.args.get("include_keys", "false").lower() == "true"

    try:
        export_data = engine.export_session(session_id, include_keys=include_keys)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404

    filename = f"zrtp-session-{session_id[:8]}.json"
    json_str = json.dumps(export_data, indent=2, ensure_ascii=False)

    return Response(
        json_str,
        mimetype="application/json",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


@app.route("/api/zrtp/history", methods=["GET"])
def history():
    return jsonify({"sessions": engine.get_history()})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
