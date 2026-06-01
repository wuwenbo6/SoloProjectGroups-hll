from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
from flask_socketio import SocketIO
import os
from .simulator import Simulator

app = Flask(__name__, static_folder="../dist", static_url_path="")
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

simulator = Simulator()


def broadcast_state():
    state = simulator.get_state()
    socketio.emit("state", state)


simulator.on("wal", lambda data: socketio.emit("wal", data))
simulator.on("conflict", lambda data: socketio.emit("conflict", data))
simulator.on("state_change", lambda data: socketio.emit("state", data))


@app.route("/")
def index():
    dist_path = os.path.join(os.path.dirname(__file__), "..", "dist")
    if os.path.exists(os.path.join(dist_path, "index.html")):
        return send_from_directory(dist_path, "index.html")
    return jsonify({"message": "PostgreSQL Logical Replication Simulator API"}), 200


@app.route("/api/state", methods=["GET"])
def get_state():
    return jsonify(simulator.get_state())


@app.route("/api/conflicts", methods=["GET"])
def get_conflicts():
    return jsonify(simulator.subscriber.get_conflict_stats())


@app.route("/api/insert", methods=["POST"])
def insert():
    data = request.get_json() or {}
    record_id = data.get("id")
    record_data = data.get("data")
    try:
        result = simulator.insert(record_id, record_data)
        broadcast_state()
        return jsonify(result)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/update", methods=["POST"])
def update():
    data = request.get_json() or {}
    record_id = data.get("id")
    record_data = data.get("data")
    if not record_id:
        return jsonify({"success": False, "error": "id is required"}), 400
    try:
        result = simulator.update(record_id, record_data)
        broadcast_state()
        return jsonify(result)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/upsert", methods=["POST"])
def upsert():
    data = request.get_json() or {}
    record_id = data.get("id")
    record_data = data.get("data")
    if not record_id:
        return jsonify({"success": False, "error": "id is required"}), 400
    try:
        result = simulator.upsert(record_id, record_data)
        broadcast_state()
        return jsonify(result)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/trigger-conflict", methods=["POST"])
def trigger_conflict():
    data = request.get_json() or {}
    record_id = data.get("id")
    if not record_id:
        return jsonify({"success": False, "error": "id is required"}), 400
    try:
        result = simulator.insert_conflict_pair(record_id)
        broadcast_state()
        return jsonify(result)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/simulate", methods=["POST"])
def simulate():
    data = request.get_json() or {}
    action = data.get("action")
    interval = data.get("interval", 1.0)
    conflict_rate = data.get("conflict_rate", 0.3)

    if action == "start":
        result = simulator.start_auto_simulate(interval, conflict_rate)
    elif action == "stop":
        result = simulator.stop_auto_simulate()
    else:
        return jsonify({"success": False, "error": "Invalid action. Use 'start' or 'stop'"}), 400

    broadcast_state()
    return jsonify(result)


@app.route("/api/reset", methods=["POST"])
def reset():
    result = simulator.reset()
    broadcast_state()
    return jsonify(result)


@app.route("/api/audit", methods=["GET"])
def get_audit():
    return jsonify({
        "logs": simulator.get_audit_logs()
    })


@app.route("/api/lua-script", methods=["GET"])
def get_lua_script():
    return jsonify(simulator.get_lua_script())


@app.route("/api/lua-script", methods=["PUT"])
def update_lua_script():
    data = request.get_json() or {}
    script = data.get("script", "")
    if not script.strip():
        return jsonify({"success": False, "error": "Script cannot be empty"}), 400
    result = simulator.update_lua_script(script)
    if result["success"]:
        broadcast_state()
    return jsonify(result)


@app.route("/api/lua-script/reset", methods=["POST"])
def reset_lua_script():
    result = simulator.reset_lua_script()
    if result["success"]:
        broadcast_state()
    return jsonify(result)


@app.route("/api/lua-script/validate", methods=["POST"])
def validate_lua_script():
    data = request.get_json() or {}
    script = data.get("script", "")
    return jsonify(simulator.validate_lua_script(script))


@app.route("/api/latency", methods=["GET"])
def get_latency():
    window = request.args.get("window", 10, type=int)
    return jsonify({
        "stats": simulator.get_latency_stats(),
        "trend": simulator.get_latency_trend(window)
    })


@app.route("/api/latency/export", methods=["GET"])
def export_latency():
    fmt = request.args.get("format", "json")
    if fmt == "csv":
        csv_data = simulator.export_latency_csv()
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=latency_trend.csv"}
        )
    return jsonify({
        "data": simulator.export_latency_json(),
        "stats": simulator.get_latency_stats()
    })


@socketio.on("connect")
def handle_connect():
    broadcast_state()


@socketio.on("get_state")
def handle_get_state():
    return simulator.get_state()


def create_app():
    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=True)
