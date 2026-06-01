import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    from scapy.all import get_if_list
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False

from capture import capture_service

app = Flask(__name__)
CORS(app)


@app.route("/api/status", methods=["GET"])
def get_status():
    return jsonify(capture_service.get_status())


@app.route("/api/capture/start", methods=["POST"])
def start_capture():
    data = request.get_json(silent=True) or {}
    interface = data.get("interface")

    if not interface:
        return jsonify({"error": "interface is required"}), 400

    if not SCAPY_AVAILABLE:
        return jsonify({"error": "scapy is not installed"}), 503

    result = capture_service.start(interface)
    if "error" in result:
        return jsonify(result), 409 if "already" in result["error"] else 400

    return jsonify(result)


@app.route("/api/capture/stop", methods=["POST"])
def stop_capture():
    result = capture_service.stop()
    if "error" in result:
        return jsonify(result), 400

    return jsonify(result)


@app.route("/api/networks", methods=["GET"])
def get_networks():
    return jsonify(capture_service.get_networks())


@app.route("/api/routes", methods=["GET"])
def get_routes():
    return jsonify(capture_service.get_routes())


@app.route("/api/packets", methods=["GET"])
def get_packets():
    return jsonify(capture_service.get_packets())


@app.route("/api/interfaces", methods=["GET"])
def get_interfaces():
    if not SCAPY_AVAILABLE:
        return jsonify({"interfaces": [], "error": "scapy is not installed"})

    try:
        interfaces = get_if_list()
        return jsonify({"interfaces": interfaces})
    except Exception as e:
        return jsonify({"interfaces": [], "error": str(e)})


@app.route("/api/aarp", methods=["GET"])
def get_aarp():
    return jsonify(capture_service.get_aarp())


@app.route("/api/nbp", methods=["GET"])
def get_nbp():
    return jsonify(capture_service.get_nbp())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
