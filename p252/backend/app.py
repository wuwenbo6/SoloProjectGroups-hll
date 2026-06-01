import os
import uuid
import json
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from eapol_parser import parse_pcap, parse_pcap_bytes, generate_sample_data

app = Flask(__name__)
CORS(app)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "samples")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(SAMPLES_DIR, exist_ok=True)

analysis_store = {}


@app.route("/api/analyze/upload", methods=["POST"])
def upload_and_analyze():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400

    analysis_id = str(uuid.uuid4())[:8]
    filepath = os.path.join(UPLOAD_DIR, f"{analysis_id}_{f.filename}")
    f.save(filepath)

    try:
        result = parse_pcap(filepath)
        result["id"] = analysis_id
        analysis_store[analysis_id] = result
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


@app.route("/api/analyze/sample", methods=["GET"])
def load_sample():
    sample_path = os.path.join(SAMPLES_DIR, "eapol_sample.pcap")
    if os.path.exists(sample_path):
        try:
            result = parse_pcap(sample_path)
        except Exception as e:
            result = generate_sample_data()
    else:
        result = generate_sample_data()

    analysis_id = str(uuid.uuid4())[:8]
    result["id"] = analysis_id
    analysis_store[analysis_id] = result
    return jsonify(result)


@app.route("/api/analyze/<analysis_id>/message/<int:message_id>", methods=["GET"])
def get_message_detail(analysis_id, message_id):
    result = analysis_store.get(analysis_id)
    if not result:
        return jsonify({"error": "Analysis not found"}), 404

    for msg in result.get("messages", []):
        if msg["id"] == message_id:
            return jsonify(msg)

    return jsonify({"error": "Message not found"}), 404


@app.route("/api/analyze/<analysis_id>/certificates", methods=["GET"])
def get_certificates(analysis_id):
    result = analysis_store.get(analysis_id)
    if not result:
        return jsonify({"error": "Analysis not found"}), 404

    certs = result.get("certificateChain", [])
    return jsonify(certs)


@app.route("/api/analyze/<analysis_id>/certificates/export", methods=["GET"])
def export_certificates(analysis_id):
    result = analysis_store.get(analysis_id)
    if not result:
        return jsonify({"error": "Analysis not found"}), 404

    certs = result.get("certificateChain", [])
    if not certs:
        return jsonify({"error": "No certificates found"}), 404

    format_type = request.args.get("format", "pem")

    if format_type == "pem":
        pem_content = ""
        for cert in certs:
            pem_content += cert.get("pem", "")
        return Response(
            pem_content,
            mimetype="application/x-pem-file",
            headers={"Content-Disposition": f"attachment; filename=cert-chain-{analysis_id}.pem"},
        )
    elif format_type == "der":
        import base64
        all_der = b""
        for cert in certs:
            der_b64 = cert.get("derBase64", "")
            if der_b64:
                all_der += base64.b64decode(der_b64)
        return Response(
            all_der,
            mimetype="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename=cert-chain-{analysis_id}.der"},
        )
    else:
        return jsonify({"error": "Unsupported format. Use 'pem' or 'der'"}), 400


@app.route("/api/analyze/<analysis_id>/radius", methods=["GET"])
def get_radius_messages(analysis_id):
    result = analysis_store.get(analysis_id)
    if not result:
        return jsonify({"error": "Analysis not found"}), 404

    return jsonify(result.get("radiusMessages", []))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
