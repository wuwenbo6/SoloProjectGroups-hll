import json
import time
import random
import threading

from flask import Flask, send_from_directory
from flask_socketio import SocketIO, emit

from drbd.cluster import Cluster
from drbd.recovery import RecoveryOrchestrator, ResyncOrchestrator, ReportGenerator

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.config["SECRET_KEY"] = "drbd-simulator"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

cluster = None
recovery = None
resync = None
report_gen = None
simulation_state = {
    "initialized": False,
    "recovery_log": [],
    "events": [],
    "last_detection": None,
    "last_selection": None,
    "last_recovery": None,
}


def broadcast_event(event_type, **kwargs):
    data = {"type": event_type, "timestamp": time.time(), **kwargs}
    simulation_state["events"].append(data)
    if len(simulation_state["events"]) > 500:
        simulation_state["events"] = simulation_state["events"][-500:]
    socketio.emit("cluster_event", data)


def on_cluster_event(event_type, **kwargs):
    broadcast_event(event_type, **kwargs)
    broadcast_status()


def on_recovery_event(entry):
    simulation_state["recovery_log"].append(entry)
    socketio.emit("recovery_event", entry)
    broadcast_status()


def broadcast_status():
    if cluster:
        status = cluster.get_status()
        socketio.emit("status_update", status)


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@socketio.on("connect")
def on_connect():
    broadcast_status()


@socketio.on("init_cluster")
def handle_init(data):
    global cluster, recovery, resync, report_gen
    cluster = Cluster(event_callback=on_cluster_event)
    recovery = RecoveryOrchestrator(event_callback=on_recovery_event)
    resync = ResyncOrchestrator(event_callback=on_recovery_event)
    report_gen = ReportGenerator()
    simulation_state["initialized"] = False
    simulation_state["recovery_log"] = []
    simulation_state["events"] = []
    simulation_state["last_detection"] = None
    simulation_state["last_selection"] = None
    simulation_state["last_recovery"] = None

    node_a_pri = data.get("priority_a", 2) if isinstance(data, dict) else 2
    node_b_pri = data.get("priority_b", 1) if isinstance(data, dict) else 1
    bitmap_size = data.get("bitmap_size", 128) if isinstance(data, dict) else 128

    cluster.add_node("A", 7100, priority=node_a_pri, bitmap_size=bitmap_size)
    cluster.add_node("B", 7101, priority=node_b_pri, bitmap_size=bitmap_size)
    time.sleep(0.5)

    cluster.connect("A", "B")
    time.sleep(0.5)

    simulation_state["initialized"] = True
    broadcast_event("init_complete")
    broadcast_status()


@socketio.on("partition")
def handle_partition(data=None):
    if not cluster:
        return
    cluster.partition("A", "B")
    broadcast_event("partition_triggered")
    broadcast_status()


@socketio.on("reconnect")
def handle_reconnect(data=None):
    if not cluster:
        return
    cluster.reconnect("A", "B")
    broadcast_event("reconnect_triggered")
    broadcast_status()


@socketio.on("write")
def handle_write(data):
    if not cluster:
        return
    node_id = data.get("node_id", "A")
    block_id = data.get("block_id")
    count = data.get("count", 1)

    if block_id is not None:
        cluster.write_to_node(node_id, block_id)
    else:
        bitmap_size = cluster.nodes[node_id].bitmap.size
        for _ in range(count):
            bid = random.randint(0, bitmap_size - 1)
            cluster.write_to_node(node_id, bid)

    broadcast_status()


@socketio.on("auto_split_brain")
def handle_auto_split_brain(data=None):
    if not cluster:
        return

    cluster.partition("A", "B")
    broadcast_event("auto_split_brain_start", message="Triggering split-brain scenario")
    broadcast_status()

    def scenario():
        time.sleep(1)
        bitmap_size = list(cluster.nodes.values())[0].bitmap.size

        for _ in range(random.randint(3, 6)):
            bid = random.randint(0, bitmap_size - 1)
            cluster.write_to_node("A", bid)
            broadcast_status()
            time.sleep(0.3)

        for _ in range(random.randint(3, 6)):
            bid = random.randint(0, bitmap_size - 1)
            cluster.write_to_node("B", bid)
            broadcast_status()
            time.sleep(0.3)

        broadcast_event(
            "auto_split_brain_writes_done",
            message="Both nodes have divergent writes. Ready to reconnect.",
        )

    t = threading.Thread(target=scenario, daemon=True)
    t.start()


@socketio.on("start_recovery")
def handle_recovery(data=None):
    if not cluster or not recovery:
        return

    if not cluster.partitioned:
        cluster.reconnect("A", "B")
        time.sleep(0.5)

    def do_recovery():
        result = recovery.recover(cluster.nodes["A"], cluster.nodes["B"])
        simulation_state["last_recovery"] = result
        if recovery.detector.detection_log:
            simulation_state["last_detection"] = recovery.detector.detection_log[-1]
        socketio.emit("recovery_result", result)
        broadcast_status()

    t = threading.Thread(target=do_recovery, daemon=True)
    t.start()


@socketio.on("auto_resync")
def handle_auto_resync(data=None):
    if not cluster or not resync:
        return

    if not cluster.nodes["A"].connected or not cluster.nodes["B"].connected:
        cluster.reconnect("A", "B")
        time.sleep(0.5)

    def do_resync():
        from drbd.recovery import NodeSelector
        selector = NodeSelector()
        sel = selector.select_source(cluster.nodes["A"], cluster.nodes["B"])
        simulation_state["last_selection"] = {
            "source": sel["source"],
            "target": sel["target"],
            "reason": sel["reason"],
            "weights": sel.get("weights"),
        }

        source = sel["source_node"]
        target = sel["target_node"]

        result = resync.resync(source, target)
        socketio.emit("resync_result", result)
        broadcast_status()

    t = threading.Thread(target=do_resync, daemon=True)
    t.start()


@socketio.on("export_report")
def handle_export_report(data=None):
    if not cluster or not report_gen:
        return

    fmt = data.get("format", "json") if isinstance(data, dict) else "json"

    detector = recovery.detector if recovery else None
    detection = detector.detection_log[-1] if (detector and detector.detection_log) else None
    selection = simulation_state.get("last_selection")
    recovery_result = simulation_state.get("last_recovery")

    report = report_gen.generate(
        cluster.nodes["A"],
        cluster.nodes["B"],
        detection_result=detection,
        selection_result=selection,
        recovery_result=recovery_result,
    )

    if fmt == "text":
        report_text = report_gen.format_text(report)
        socketio.emit("report_ready", {"format": "text", "content": report_text, "report": report})
    else:
        socketio.emit("report_ready", {"format": "json", "content": report, "report": report})

    broadcast_event("report_exported", format=fmt)


@socketio.on("reset")
def handle_reset(data=None):
    global cluster, recovery, resync, report_gen
    if cluster:
        cluster.stop_all()
    cluster = None
    recovery = None
    resync = None
    report_gen = None
    simulation_state["initialized"] = False
    simulation_state["recovery_log"] = []
    simulation_state["events"] = []
    simulation_state["last_detection"] = None
    simulation_state["last_selection"] = None
    simulation_state["last_recovery"] = None
    broadcast_event("reset_complete")
    broadcast_status()


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=8090, debug=False, allow_unsafe_werkzeug=True)
