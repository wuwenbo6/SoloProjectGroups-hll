import io
import os
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
from ipfix_collector import IPFIXCollector

app = Flask(__name__, static_folder="static")
CORS(app)

collector = IPFIXCollector(host="0.0.0.0", port=4739, max_records=10000)


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/records")
def get_records():
    limit = request.args.get("limit", 100, type=int)
    offset = request.args.get("offset", 0, type=int)
    records = collector.get_records_as_dict(limit=limit, offset=offset)
    return jsonify({
        "success": True,
        "data": records,
        "total": len(collector.get_records())
    })


@app.route("/api/records/search")
def search_records():
    source_ip = request.args.get("source_ip")
    destination_ip = request.args.get("destination_ip")
    protocol = request.args.get("protocol")
    source_port = request.args.get("source_port")
    destination_port = request.args.get("destination_port")
    limit = request.args.get("limit", 100, type=int)

    records = collector.search_records(
        source_ip=source_ip,
        destination_ip=destination_ip,
        protocol=protocol,
        source_port=source_port,
        destination_port=destination_port,
        limit=limit
    )

    return jsonify({
        "success": True,
        "data": records,
        "total": len(records)
    })


@app.route("/api/stats")
def get_stats():
    stats = collector.get_stats()
    return jsonify({
        "success": True,
        "data": stats
    })


@app.route("/api/templates")
def get_templates():
    templates = collector.get_templates_as_dict()
    return jsonify({
        "success": True,
        "data": templates,
        "total": len(templates)
    })


@app.route("/api/top-talkers")
def get_top_talkers():
    by_source = request.args.get("by_source", "true").lower() == "true"
    limit = request.args.get("limit", 10, type=int)
    talkers = collector.get_top_talkers(by_source=by_source, limit=limit)
    return jsonify({
        "success": True,
        "data": talkers,
        "total": len(talkers)
    })


@app.route("/api/records/clear", methods=["POST"])
def clear_records():
    collector.clear_records()
    return jsonify({
        "success": True,
        "message": "Records cleared"
    })


@app.route("/api/export/parquet")
def export_parquet():
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError:
        return jsonify({
            "success": False,
            "error": "pyarrow is not installed. Run: pip install pyarrow"
        }), 500

    limit = request.args.get("limit", 10000, type=int)
    offset = request.args.get("offset", 0, type=int)

    flat_records = collector.export_records_flat(limit=limit, offset=offset)

    if not flat_records:
        return jsonify({
            "success": False,
            "error": "No records to export"
        }), 404

    columns = {
        "template_id": pa.int32(),
        "domain_id": pa.int32(),
        "timestamp": pa.string(),
        "source_ip": pa.string(),
        "destination_ip": pa.string(),
        "source_port": pa.int64(),
        "destination_port": pa.int64(),
        "protocol": pa.string(),
        "octets": pa.int64(),
        "packets": pa.int64(),
    }

    arrays = {}
    for col_name, col_type in columns.items():
        values = []
        for r in flat_records:
            v = r.get(col_name)
            if v is None:
                values.append(None)
            elif col_name in ("source_port", "destination_port", "octets", "packets"):
                try:
                    values.append(int(v))
                except (ValueError, TypeError):
                    values.append(None)
            elif col_name in ("template_id", "domain_id"):
                try:
                    values.append(int(v))
                except (ValueError, TypeError):
                    values.append(None)
            else:
                values.append(str(v) if v is not None else None)
        arrays[col_name] = pa.array(values, type=col_type)

    table = pa.table(arrays)

    buf = io.BytesIO()
    pq.write_table(table, buf)
    buf.seek(0)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    anon_tag = "_anonymized" if collector.anonymize else ""
    filename = f"ipfix_records_{timestamp}{anon_tag}.parquet"

    return send_file(
        buf,
        mimetype="application/octet-stream",
        as_attachment=True,
        download_name=filename
    )


@app.route("/api/anonymize", methods=["GET"])
def get_anonymize_config():
    config = collector.get_anonymize_config()
    return jsonify({
        "success": True,
        "data": config
    })


@app.route("/api/anonymize", methods=["POST"])
def set_anonymize_config():
    data = request.get_json(force=True)
    enabled = data.get("enabled", False)
    key = data.get("key")
    prefix_len = data.get("prefix_len")

    collector.set_anonymize(enabled=enabled, key=key, prefix_len=prefix_len)

    return jsonify({
        "success": True,
        "data": collector.get_anonymize_config()
    })


def main():
    collector.start()
    try:
        app.run(host="0.0.0.0", port=8080, debug=False)
    finally:
        collector.stop()


if __name__ == "__main__":
    main()
