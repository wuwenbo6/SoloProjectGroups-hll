import csv
import io
import os
import threading
import time
from datetime import datetime, timezone

from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import swiftclient.service
from swiftclient.service import SwiftService, SwiftUploadObject
from swiftclient.client import Connection

app = Flask(__name__)
CORS(app)

swift_conn = None
swift_lock = threading.Lock()

scan_state = {
    "scanning": False,
    "progress": 0.0,
    "total_containers": 0,
    "scanned_containers": 0,
    "total_objects": 0,
    "cold_objects": 0,
    "cold_object_list": [],
    "last_scan_time": None,
    "error": None,
}

COLD_THRESHOLD_DAYS = 90
LIST_PAGE_SIZE = 1000


def get_connection():
    return swift_conn


def compute_days_inactive(time_str):
    try:
        ts = float(time_str)
        last_time = datetime.fromtimestamp(ts, tz=timezone.utc)
        now = datetime.now(timezone.utc)
        return (now - last_time).days
    except (ValueError, TypeError, OSError):
        return -1


def list_objects_paginated(conn, container_name):
    marker = None
    all_objects = []
    while True:
        if not scan_state["scanning"]:
            break
        kwargs = {"limit": LIST_PAGE_SIZE}
        if marker:
            kwargs["marker"] = marker
        try:
            _, objects = conn.get_container(container_name, **kwargs)
        except Exception:
            break
        if not objects:
            break
        all_objects.extend(objects)
        marker = objects[-1]["name"]
    return all_objects


def get_object_timestamps(conn, container_name, object_name):
    try:
        headers = conn.head_object(container_name, object_name)
        access_time = headers.get("x-object-meta-access-time")
        x_timestamp = headers.get("x-timestamp")
        return {
            "access_time": access_time,
            "x_timestamp": x_timestamp,
            "source": "meta" if access_time else ("timestamp" if x_timestamp else "none"),
        }
    except Exception:
        return {"access_time": None, "x_timestamp": None, "source": "none"}


def do_scan():
    global swift_conn
    with swift_lock:
        conn = get_connection()
        if conn is None:
            scan_state["scanning"] = False
            scan_state["error"] = "Not connected to Swift"
            return

        scan_state["scanning"] = True
        scan_state["progress"] = 0.0
        scan_state["scanned_containers"] = 0
        scan_state["total_objects"] = 0
        scan_state["cold_objects"] = 0
        scan_state["cold_object_list"] = []
        scan_state["error"] = None

    try:
        _, containers = conn.get_account()
        container_list = [c["name"] for c in containers]
        scan_state["total_containers"] = len(container_list)

        for idx, container_name in enumerate(container_list):
            if not scan_state["scanning"]:
                break

            objects = list_objects_paginated(conn, container_name)

            for obj in objects:
                if not scan_state["scanning"]:
                    break

                obj_name = obj.get("name", "")
                ts_info = get_object_timestamps(conn, container_name, obj_name)

                time_str = ts_info["access_time"] or ts_info["x_timestamp"] or ""
                days = compute_days_inactive(time_str)
                scan_state["total_objects"] += 1

                if days >= COLD_THRESHOLD_DAYS:
                    scan_state["cold_objects"] += 1
                    scan_state["cold_object_list"].append({
                        "container": container_name,
                        "name": obj_name,
                        "bytes": obj.get("bytes", 0),
                        "content_type": obj.get("content_type", ""),
                        "last_modified": obj.get("last_modified", ""),
                        "x_timestamp": ts_info["x_timestamp"] or "",
                        "access_time": ts_info["access_time"] or "",
                        "time_source": ts_info["source"],
                        "days_inactive": days,
                    })

            scan_state["scanned_containers"] = idx + 1
            if scan_state["total_containers"] > 0:
                scan_state["progress"] = round(
                    (idx + 1) / scan_state["total_containers"] * 100, 1
                )

    except Exception as e:
        scan_state["error"] = str(e)
    finally:
        scan_state["scanning"] = False
        scan_state["last_scan_time"] = datetime.now(timezone.utc).isoformat()


@app.route("/api/connect", methods=["POST"])
def api_connect():
    global swift_conn
    data = request.get_json(force=True)
    auth_url = data.get("auth_url", "")
    username = data.get("username", "")
    password = data.get("password", "")
    project_name = data.get("project_name", "")
    project_domain_name = data.get("project_domain_name", "Default")
    user_domain_name = data.get("user_domain_name", "Default")

    if not all([auth_url, username, password, project_name]):
        return jsonify({"success": False, "message": "缺少必要连接参数"}), 400

    try:
        swift_conn = Connection(
            authurl=auth_url,
            user=username,
            key=password,
            tenant_name=project_name,
            project_domain_name=project_domain_name,
            user_domain_name=user_domain_name,
            auth_version="3",
        )
        swift_conn.get_account()
        return jsonify({"success": True, "message": "连接成功"})
    except Exception as e:
        swift_conn = None
        return jsonify({"success": False, "message": f"连接失败: {str(e)}"}), 400


@app.route("/api/status", methods=["GET"])
def api_status():
    if swift_conn is None:
        return jsonify({"connected": False, "auth_url": "", "username": ""})

    try:
        swift_conn.get_account()
        return jsonify({
            "connected": True,
            "auth_url": swift_conn.url,
            "username": swift_conn.os_options.get("username", ""),
        })
    except Exception:
        return jsonify({"connected": False, "auth_url": "", "username": ""})


@app.route("/api/scan", methods=["POST"])
def api_scan():
    if swift_conn is None:
        return jsonify({"error": "Not connected"}), 400

    if scan_state["scanning"]:
        return jsonify({"error": "Scan already in progress"}), 409

    thread = threading.Thread(target=do_scan, daemon=True)
    thread.start()
    return jsonify({"task_id": "scan"})


@app.route("/api/scan/status", methods=["GET"])
def api_scan_status():
    return jsonify({
        "scanning": scan_state["scanning"],
        "progress": scan_state["progress"],
        "total_containers": scan_state["total_containers"],
        "scanned_containers": scan_state["scanned_containers"],
        "total_objects": scan_state["total_objects"],
        "cold_objects": scan_state["cold_objects"],
        "last_scan_time": scan_state["last_scan_time"],
        "error": scan_state["error"],
    })


@app.route("/api/containers", methods=["GET"])
def api_containers():
    if swift_conn is None:
        return jsonify({"error": "Not connected"}), 400

    try:
        _, containers = swift_conn.get_account()
        return jsonify({"containers": containers})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/cold-objects", methods=["GET"])
def api_cold_objects():
    container = request.args.get("container", "")
    sort_by = request.args.get("sort_by", "days_inactive")
    order = request.args.get("order", "desc")
    page = int(request.args.get("page", "1"))
    page_size = int(request.args.get("page_size", "50"))
    search = request.args.get("search", "")

    objects = list(scan_state["cold_object_list"])

    if container:
        objects = [o for o in objects if o["container"] == container]

    if search:
        objects = [o for o in objects if search.lower() in o["name"].lower()]

    reverse = order == "desc"
    if sort_by in ("days_inactive", "bytes"):
        objects.sort(key=lambda o: o.get(sort_by, 0), reverse=reverse)
    elif sort_by == "last_modified":
        objects.sort(key=lambda o: o.get("last_modified", ""), reverse=reverse)
    elif sort_by == "name":
        objects.sort(key=lambda o: o.get("name", ""), reverse=reverse)
    elif sort_by == "container":
        objects.sort(key=lambda o: o.get("container", ""), reverse=reverse)

    total = len(objects)
    start = (page - 1) * page_size
    end = start + page_size
    paginated = objects[start:end]

    return jsonify({
        "objects": paginated,
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@app.route("/api/objects", methods=["DELETE"])
def api_delete_objects():
    if swift_conn is None:
        return jsonify({"error": "Not connected"}), 400

    data = request.get_json(force=True)
    objects_to_delete = data.get("objects", [])

    deleted = 0
    failed = 0
    errors = []

    for obj in objects_to_delete:
        container = obj.get("container", "")
        name = obj.get("name", "")
        if not container or not name:
            continue

        try:
            swift_conn.delete_object(container, name)
            deleted += 1
            scan_state["cold_object_list"] = [
                o for o in scan_state["cold_object_list"]
                if not (o["container"] == container and o["name"] == name)
            ]
            scan_state["cold_objects"] = len(scan_state["cold_object_list"])
        except Exception as e:
            failed += 1
            errors.append(f"{container}/{name}: {str(e)}")

    return jsonify({"deleted": deleted, "failed": failed, "errors": errors})


@app.route("/api/cleanup-all", methods=["DELETE"])
def api_cleanup_all():
    if swift_conn is None:
        return jsonify({"error": "Not connected"}), 400

    objects_to_delete = list(scan_state["cold_object_list"])

    deleted = 0
    failed = 0
    errors = []

    for obj in objects_to_delete:
        container = obj.get("container", "")
        name = obj.get("name", "")
        if not container or not name:
            continue

        try:
            swift_conn.delete_object(container, name)
            deleted += 1
        except Exception as e:
            failed += 1
            errors.append(f"{container}/{name}: {str(e)}")

    scan_state["cold_object_list"] = []
    scan_state["cold_objects"] = 0

    return jsonify({"deleted": deleted, "failed": failed, "errors": errors})


ARCHIVE_CONTAINER = "_cold_archive"


def _ensure_archive_container(conn):
    try:
        conn.head_container(ARCHIVE_CONTAINER)
    except Exception:
        conn.put_container(ARCHIVE_CONTAINER)


def _archive_single(conn, src_container, src_name):
    dest_name = f"{src_container}/{src_name}"
    try:
        _ensure_archive_container(conn)
        headers, content = conn.get_object(src_container, src_name)
        meta_headers = {}
        for k, v in headers.items():
            if k.startswith("x-object-meta-"):
                meta_headers[k] = v
        conn.put_object(
            ARCHIVE_CONTAINER,
            dest_name,
            contents=content,
            content_type=headers.get("content-type", "application/octet-stream"),
            headers=meta_headers,
        )
        conn.delete_object(src_container, src_name)
        return True, None
    except Exception as e:
        return False, str(e)


@app.route("/api/archive", methods=["POST"])
def api_archive_objects():
    if swift_conn is None:
        return jsonify({"error": "Not connected"}), 400

    data = request.get_json(force=True)
    objects_to_archive = data.get("objects", [])

    archived = 0
    failed = 0
    errors = []

    for obj in objects_to_archive:
        container = obj.get("container", "")
        name = obj.get("name", "")
        if not container or not name:
            continue

        ok, err = _archive_single(swift_conn, container, name)
        if ok:
            archived += 1
            scan_state["cold_object_list"] = [
                o for o in scan_state["cold_object_list"]
                if not (o["container"] == container and o["name"] == name)
            ]
        else:
            failed += 1
            errors.append(f"{container}/{name}: {err}")

    scan_state["cold_objects"] = len(scan_state["cold_object_list"])
    return jsonify({"archived": archived, "failed": failed, "errors": errors})


@app.route("/api/archive-all", methods=["POST"])
def api_archive_all():
    if swift_conn is None:
        return jsonify({"error": "Not connected"}), 400

    objects_to_archive = list(scan_state["cold_object_list"])

    archived = 0
    failed = 0
    errors = []

    for obj in objects_to_archive:
        container = obj.get("container", "")
        name = obj.get("name", "")
        if not container or not name:
            continue

        ok, err = _archive_single(swift_conn, container, name)
        if ok:
            archived += 1
        else:
            failed += 1
            errors.append(f"{container}/{name}: {err}")

    scan_state["cold_object_list"] = []
    scan_state["cold_objects"] = 0
    return jsonify({"archived": archived, "failed": failed, "errors": errors})


@app.route("/api/cold-objects/export", methods=["GET"])
def api_export_csv():
    container = request.args.get("container", "")
    search = request.args.get("search", "")

    objects = list(scan_state["cold_object_list"])

    if container:
        objects = [o for o in objects if o["container"] == container]
    if search:
        objects = [o for o in objects if search.lower() in o["name"].lower()]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "容器", "对象名称", "大小(Bytes)", "内容类型",
        "最后修改时间", "X-Timestamp", "Access-Time",
        "时间来源", "未访问天数",
    ])
    for obj in objects:
        writer.writerow([
            obj.get("container", ""),
            obj.get("name", ""),
            obj.get("bytes", 0),
            obj.get("content_type", ""),
            obj.get("last_modified", ""),
            obj.get("x_timestamp", ""),
            obj.get("access_time", ""),
            obj.get("time_source", ""),
            obj.get("days_inactive", 0),
        ])

    filename = f"cold_objects_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=True)
