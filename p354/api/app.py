import uuid
import os
import tempfile

from flask import Flask, request, jsonify, Response
from flask_cors import CORS

from bluefs_parser import parse_log
from leak_detector import (
    detect_leaks,
    paginate,
    filter_logs,
    sort_leaks,
    read_log_from_bytes,
    generate_fix_script,
    export_leak_report,
)
from generate_sample import generate_sample_log

app = Flask(__name__)
CORS(app)

tasks: dict[str, dict] = {}


def _make_task_id() -> str:
    return str(uuid.uuid4())


def _process_single_file(data: bytes, seq_offset: int = 0) -> list:
    try:
        decoded_data = read_log_from_bytes(data)
        entries = parse_log(decoded_data)
        for e in entries:
            e["seq"] += seq_offset
        return entries
    except Exception:
        return []


def _process_data(data_list: list[bytes]) -> str:
    task_id = _make_task_id()
    tasks[task_id] = {"status": "processing"}

    try:
        all_entries: list = []
        seq_offset = 0
        for data in data_list:
            entries = _process_single_file(data, seq_offset)
            all_entries.extend(entries)
            if entries:
                seq_offset = max(e["seq"] for e in entries) + 1

        all_entries.sort(key=lambda x: x["seq"])
        result = detect_leaks(all_entries)
        tasks[task_id] = {
            "status": "completed",
            "logs": result.logs,
            "leaks": result.leaks,
            "overview": result.overview,
            "trend": result.trend,
            "summary": result.summary,
            "file_count": len(data_list),
        }
    except Exception as e:
        tasks[task_id] = {"status": "error", "error": str(e)}

    return task_id


@app.route("/api/upload", methods=["POST"])
def upload():
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files provided"}), 400

    data_list: list[bytes] = []
    for f in files:
        if f.filename != "":
            data_list.append(f.read())

    if not data_list:
        return jsonify({"error": "Empty files"}), 400

    task_id = _process_data(data_list)
    return jsonify({"task_id": task_id})


@app.route("/api/status/<task_id>")
def status(task_id):
    if task_id not in tasks:
        return jsonify({"error": "Task not found"}), 404

    t = tasks[task_id]
    return jsonify({"task_id": task_id, "status": t["status"]})


@app.route("/api/analysis/<task_id>/overview")
def overview(task_id):
    if task_id not in tasks:
        return jsonify({"error": "Task not found"}), 404

    t = tasks[task_id]
    if t["status"] != "completed":
        return jsonify({"error": "Task not completed", "status": t["status"]}), 400

    return jsonify(t["overview"])


@app.route("/api/analysis/<task_id>/logs")
def logs(task_id):
    if task_id not in tasks:
        return jsonify({"error": "Task not found"}), 404

    t = tasks[task_id]
    if t["status"] != "completed":
        return jsonify({"error": "Task not completed", "status": t["status"]}), 400

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    op_type = request.args.get("type", "all")

    filtered = filter_logs(t["logs"], op_type)
    result = paginate(filtered, page, per_page)

    return jsonify({
        "logs": result["items"],
        "total": result["total"],
        "page": result["page"],
        "per_page": result["per_page"],
    })


@app.route("/api/analysis/<task_id>/leaks")
def leaks(task_id):
    if task_id not in tasks:
        return jsonify({"error": "Task not found"}), 404

    t = tasks[task_id]
    if t["status"] != "completed":
        return jsonify({"error": "Task not completed", "status": t["status"]}), 400

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    sort_by = request.args.get("sort_by", "size")
    order = request.args.get("order", "desc")

    sorted_leaks = sort_leaks(t["leaks"], sort_by, order)
    result = paginate(sorted_leaks, page, per_page)

    return jsonify({
        "leaks": result["items"],
        "total": result["total"],
        "page": result["page"],
        "per_page": result["per_page"],
        "summary": t["summary"],
    })


@app.route("/api/analysis/<task_id>/trend")
def trend(task_id):
    if task_id not in tasks:
        return jsonify({"error": "Task not found"}), 404

    t = tasks[task_id]
    if t["status"] != "completed":
        return jsonify({"error": "Task not completed", "status": t["status"]}), 400

    return jsonify(t["trend"])


@app.route("/api/analysis/<task_id>/fix", methods=["POST"])
def generate_fix(task_id):
    if task_id not in tasks:
        return jsonify({"error": "Task not found"}), 404

    t = tasks[task_id]
    if t["status"] != "completed":
        return jsonify({"error": "Task not completed", "status": t["status"]}), 400

    script_type = request.json.get("script_type", "ceph") if request.is_json else "ceph"
    leak_ids = request.json.get("leak_ids", None) if request.is_json else None

    leaks_to_fix = t["leaks"]
    if leak_ids is not None:
        leaks_to_fix = [l for l in t["leaks"] if l["id"] in leak_ids]

    result = generate_fix_script(leaks_to_fix, script_type)
    return jsonify(result)


@app.route("/api/analysis/<task_id>/export")
def export_report(task_id):
    if task_id not in tasks:
        return jsonify({"error": "Task not found"}), 404

    t = tasks[task_id]
    if t["status"] != "completed":
        return jsonify({"error": "Task not completed", "status": t["status"]}), 400

    format = request.args.get("format", "json")

    try:
        result = export_leak_report(t["leaks"], t["overview"], t["summary"], format)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return Response(
        result["content"],
        mimetype=result["content_type"],
        headers={"Content-Disposition": f"attachment; filename={result['filename']}"},
    )


@app.route("/api/demo")
def demo():
    tmp_dir = tempfile.mkdtemp()
    bin_path = os.path.join(tmp_dir, "demo_bluefs.bin")
    generate_sample_log(bin_path)

    with open(bin_path, "rb") as f:
        data = f.read()

    task_id = _process_data([data])
    return jsonify({"task_id": task_id})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
