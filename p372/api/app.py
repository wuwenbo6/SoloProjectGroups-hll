from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from .otn.frame import ODUType, ClientSignalType
from .otn.multiplex import MultiplexEngine
import io

app = Flask(__name__)
CORS(app)

engines = {odu_type.value: MultiplexEngine(odu_type) for odu_type in ODUType}


@app.route("/api/frame/<odu_type>", methods=["GET"])
def get_frame(odu_type: str):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    engine = engines[odu.value]
    return jsonify(engine.get_state())


@app.route("/api/multiplex", methods=["POST"])
def multiplex():
    data = request.json or {}
    odu_type_str = data.get("oduType", "ODU2")
    signal_id = data.get("odu0Id")
    ts_index = data.get("timeslotIndex")
    mapping_type = data.get("mappingType", "GMP")
    try:
        odu = ODUType(odu_type_str)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type_str}"}), 400
    engine = engines[odu.value]
    engine.set_mapping_type(mapping_type)
    if signal_id is None:
        return jsonify({"error": "缺少odu0Id参数"}), 400
    if ts_index is not None:
        ts_index = int(ts_index)
    result = engine.multiplex(signal_id, ts_index)
    if result is None:
        return jsonify({"error": "复用失败，可能时隙已满或信号不存在"}), 400
    return jsonify(result)


@app.route("/api/demultiplex", methods=["POST"])
def demultiplex():
    data = request.json or {}
    odu_type_str = data.get("oduType", "ODU2")
    ts_index = data.get("timeslotIndex")
    try:
        odu = ODUType(odu_type_str)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type_str}"}), 400
    if ts_index is None:
        return jsonify({"error": "缺少timeslotIndex参数"}), 400
    engine = engines[odu.value]
    result = engine.demultiplex(int(ts_index))
    if result is None:
        return jsonify({"error": "解复用失败，时隙未被占用"}), 400
    return jsonify(result)


@app.route("/api/overhead/<odu_type>", methods=["PUT"])
def update_overhead(odu_type: str):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    data = request.json or {}
    engine = engines[odu.value]
    errors = engine.update_overhead(data)
    if errors:
        return jsonify({"errors": errors}), 400
    return jsonify(engine.get_state())


@app.route("/api/timeslots/<odu_type>", methods=["GET"])
def get_timeslots(odu_type: str):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    engine = engines[odu.value]
    return jsonify(engine.timeslot_mgr.to_dict_list())


@app.route("/api/timeslots/<odu_type>/allocate", methods=["POST"])
def allocate_timeslot(odu_type: str):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    data = request.json or {}
    odu0_id = data.get("odu0Id")
    ts_index = data.get("timeslotIndex")
    mapping_type = data.get("mappingType", "GMP")
    if not odu0_id or ts_index is None:
        return jsonify({"error": "缺少odu0Id或timeslotIndex参数"}), 400
    engine = engines[odu.value]
    result = engine.timeslot_mgr.allocate(int(ts_index), odu0_id, mapping_type)
    if result is None:
        return jsonify({"error": "时隙分配失败，可能已被占用"}), 400
    return jsonify(engine.timeslot_mgr.to_dict_list())


@app.route("/api/timeslots/<odu_type>/<int:ts_index>", methods=["DELETE"])
def release_timeslot(odu_type: str, ts_index: int):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    engine = engines[odu.value]
    result = engine.timeslot_mgr.release(ts_index)
    if result is None:
        return jsonify({"error": "时隙释放失败"}), 400
    return jsonify(engine.timeslot_mgr.to_dict_list())


@app.route("/api/odu0/<odu_type>", methods=["POST"])
def add_odu0(odu_type: str):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    data = request.json or {}
    name = data.get("name", "ODU0")
    engine = engines[odu.value]
    signal = engine.add_odu0(name)
    if signal is None:
        return jsonify({"error": "无法添加ODU0信号，时隙已满"}), 400
    return jsonify({"signal": signal.to_dict(), "state": engine.get_state()})


@app.route("/api/odu0/<odu_type>/<signal_id>", methods=["DELETE"])
def remove_odu0(odu_type: str, signal_id: str):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    engine = engines[odu.value]
    success = engine.remove_odu0(signal_id)
    if not success:
        return jsonify({"error": "信号不存在"}), 404
    return jsonify(engine.get_state())


@app.route("/api/mapping/<odu_type>", methods=["PUT"])
def set_mapping(odu_type: str):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    data = request.json or {}
    mapping_type = data.get("mappingType", "GMP")
    engine = engines[odu.value]
    engine.set_mapping_type(mapping_type)
    return jsonify(engine.get_state())


@app.route("/api/odu-type", methods=["PUT"])
def set_odu_type():
    data = request.json or {}
    odu_type_str = data.get("oduType")
    if not odu_type_str:
        return jsonify({"error": "缺少oduType参数"}), 400
    try:
        odu = ODUType(odu_type_str)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type_str}"}), 400
    current_engine = engines[odu.value]
    current_engine.set_odu_type(odu)
    return jsonify(current_engine.get_state())


@app.route("/api/signal-loss/<odu_type>/<int:ts_index>", methods=["POST"])
def simulate_signal_loss(odu_type: str, ts_index: int):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    engine = engines[odu.value]
    result = engine.simulate_signal_loss(ts_index)
    if result is None:
        return jsonify({"error": "模拟信号丢失失败，时隙未被占用"}), 400
    return jsonify(result)


@app.route("/api/alarm/<odu_type>/<int:ts_index>/clear", methods=["POST"])
def clear_alarm(odu_type: str, ts_index: int):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    engine = engines[odu.value]
    result = engine.clear_alarm(ts_index)
    if result is None:
        return jsonify({"error": "清除告警失败"}), 400
    return jsonify(result)


@app.route("/api/signal/<odu_type>", methods=["POST"])
def add_signal(odu_type: str):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    data = request.json or {}
    name = data.get("name", "Signal")
    signal_type = data.get("signalType", ClientSignalType.ODU0.value)
    bitrate_gbps = data.get("bitrateGbps")
    ts_count = int(data.get("tsCount", 1))
    if bitrate_gbps is not None:
        bitrate_gbps = float(bitrate_gbps)
    engine = engines[odu.value]
    signal = engine.add_signal(name=name, signal_type=signal_type, bitrate_gbps=bitrate_gbps, ts_count=ts_count)
    if signal is None:
        return jsonify({"error": "无法添加信号，时隙不足"}), 400
    return jsonify({"signal": signal.to_dict(), "state": engine.get_state()})


@app.route("/api/export/<odu_type>/diagram", methods=["GET"])
def export_diagram(odu_type: str):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    format_type = request.args.get("format", "json")
    engine = engines[odu.value]
    diagram = engine.export_mux_diagram(format_type=format_type)
    return jsonify(diagram)


@app.route("/api/export/<odu_type>/diagram.svg", methods=["GET"])
def export_diagram_svg(odu_type: str):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    engine = engines[odu.value]
    diagram = engine.export_mux_diagram(format_type="svg")
    svg_text = diagram.get("svgText", "")
    buffer = io.BytesIO(svg_text.encode("utf-8"))
    buffer.seek(0)
    return send_file(buffer, mimetype="image/svg+xml", as_attachment=True, download_name=f"mux_diagram_{odu_type}.svg")


@app.route("/api/export/<odu_type>/diagram.json", methods=["GET"])
def export_diagram_json(odu_type: str):
    try:
        odu = ODUType(odu_type)
    except ValueError:
        return jsonify({"error": f"无效的ODU类型: {odu_type}"}), 400
    engine = engines[odu.value]
    diagram = engine.export_mux_diagram(format_type="json")
    return jsonify(diagram)
