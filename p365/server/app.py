import time
import threading
import random
import math
from flask import Flask, jsonify, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")

TOPICS = ["sensor/temp", "sensor/pressure", "sensor/humidity", "sensor/velocity", "control/command"]

publisher_state = {
    "running": False,
    "publish_rate": 10,
    "min_separation_ms": 200,
    "sent_count": 0,
    "message_id": 0,
    "lock": threading.Lock(),
    "thread": None,
    "value_counter": 0,
}


def publisher_loop():
    while publisher_state["running"]:
        with publisher_state["lock"]:
            publisher_state["message_id"] += 1
            publisher_state["value_counter"] += 1
            msg_id = publisher_state["message_id"]
            source_timestamp = time.time() * 1000

            topic = TOPICS[publisher_state["value_counter"] % len(TOPICS)]
            if topic == "sensor/temp":
                value = 20.0 + 15.0 * math.sin(publisher_state["value_counter"] * 0.1) + random.uniform(-1, 1)
            elif topic == "sensor/pressure":
                value = 100.0 + 30.0 * math.cos(publisher_state["value_counter"] * 0.08) + random.uniform(-2, 2)
            elif topic == "sensor/humidity":
                value = 40.0 + 20.0 * math.sin(publisher_state["value_counter"] * 0.05) + random.uniform(-1, 1)
            elif topic == "sensor/velocity":
                value = 50.0 + 40.0 * math.sin(publisher_state["value_counter"] * 0.12) + random.uniform(-3, 3)
            else:
                value = random.uniform(0, 100)

            msg = {
                "id": msg_id,
                "source_timestamp": source_timestamp,
                "data": f"Sample-{msg_id}",
                "topic": topic,
                "value": round(value, 2),
            }

            publisher_state["sent_count"] += 1

        socketio.emit("message", msg)

        rate = publisher_state["publish_rate"]
        if rate > 0:
            interval = 1.0 / rate
            socketio.sleep(interval)
        else:
            socketio.sleep(0.1)


@socketio.on("connect")
def handle_connect():
    emit("status", {
        "running": publisher_state["running"],
        "publish_rate": publisher_state["publish_rate"],
        "min_separation_ms": publisher_state["min_separation_ms"],
        "sent_count": publisher_state["sent_count"],
    })


@socketio.on("configure")
def handle_configure(data):
    with publisher_state["lock"]:
        if "publish_rate" in data:
            publisher_state["publish_rate"] = int(data["publish_rate"])
        if "min_separation_ms" in data:
            publisher_state["min_separation_ms"] = int(data["min_separation_ms"])
    emit("status", {
        "running": publisher_state["running"],
        "publish_rate": publisher_state["publish_rate"],
        "min_separation_ms": publisher_state["min_separation_ms"],
        "sent_count": publisher_state["sent_count"],
    })


@socketio.on("start")
def handle_start(data=None):
    if publisher_state["running"]:
        return
    with publisher_state["lock"]:
        if data:
            if "publish_rate" in data:
                publisher_state["publish_rate"] = int(data["publish_rate"])
            if "min_separation_ms" in data:
                publisher_state["min_separation_ms"] = int(data["min_separation_ms"])
        publisher_state["running"] = True
        publisher_state["sent_count"] = 0
        publisher_state["message_id"] = 0
    publisher_state["thread"] = socketio.start_background_task(publisher_loop)
    emit("status", {
        "running": True,
        "publish_rate": publisher_state["publish_rate"],
        "min_separation_ms": publisher_state["min_separation_ms"],
        "sent_count": 0,
    }, broadcast=True)


@socketio.on("stop")
def handle_stop():
    publisher_state["running"] = False
    emit("status", {
        "running": False,
        "publish_rate": publisher_state["publish_rate"],
        "min_separation_ms": publisher_state["min_separation_ms"],
        "sent_count": publisher_state["sent_count"],
    }, broadcast=True)


@socketio.on("reset")
def handle_reset():
    publisher_state["running"] = False
    with publisher_state["lock"]:
        publisher_state["sent_count"] = 0
        publisher_state["message_id"] = 0
    emit("status", {
        "running": False,
        "publish_rate": publisher_state["publish_rate"],
        "min_separation_ms": publisher_state["min_separation_ms"],
        "sent_count": 0,
    }, broadcast=True)


@app.route("/api/status", methods=["GET"])
def get_status():
    with publisher_state["lock"]:
        return jsonify({
            "running": publisher_state["running"],
            "publish_rate": publisher_state["publish_rate"],
            "min_separation_ms": publisher_state["min_separation_ms"],
            "sent_count": publisher_state["sent_count"],
        })


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5001, debug=True)
