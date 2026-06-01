from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from database import init_db, get_all_worklist, add_worklist_item, delete_worklist_item, get_worklist_by_id, search_worklist
from cmovesim import all_devices, add_device, del_device, get_device, push_one, push_all, push_history
from hl7_handler import parse_hl7_message, create_worklist_from_hl7
import os

app = Flask(__name__, static_folder="static")
CORS(app)

init_db()

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/api/worklist", methods=["GET"])
def get_worklist():
    patient_name = request.args.get("patient_name")
    patient_id = request.args.get("patient_id")
    study_uid = request.args.get("study_uid")
    accession_number = request.args.get("accession_number")
    modality = request.args.get("modality")
    referring_physician = request.args.get("referring_physician")
    study_description = request.args.get("study_description")
    if any([patient_name, patient_id, study_uid, accession_number, modality, referring_physician, study_description]):
        items = search_worklist(patient_name=patient_name, patient_id=patient_id, study_uid=study_uid, accession_number=accession_number, modality=modality, referring_physician=referring_physician, study_description=study_description)
    else:
        items = get_all_worklist()
    return jsonify(items)

@app.route("/api/worklist/search", methods=["GET"])
def search_worklist_api():
    items = search_worklist(patient_name=request.args.get("patient_name"), patient_id=request.args.get("patient_id"), study_uid=request.args.get("study_uid"), accession_number=request.args.get("accession_number"), modality=request.args.get("modality"), referring_physician=request.args.get("referring_physician"), institution_name=request.args.get("institution_name"), scheduled_date=request.args.get("scheduled_date"), scheduled_station_ae=request.args.get("scheduled_station_ae"), study_description=request.args.get("study_description"))
    return jsonify(items)

@app.route("/api/worklist", methods=["POST"])
def create_worklist_item():
    data = request.json
    patient_name = data.get("patient_name")
    if not patient_name:
        return jsonify({"error": "patient_name is required"}), 400
    item_id = add_worklist_item(patient_name=patient_name, study_uid=data.get("study_uid"), patient_id=data.get("patient_id"), patient_birth_date=data.get("patient_birth_date"), patient_sex=data.get("patient_sex"), accession_number=data.get("accession_number"), study_description=data.get("study_description"), study_date=data.get("study_date"), study_time=data.get("study_time"), modality=data.get("modality"), modality_in_study=data.get("modality_in_study"), referring_physician=data.get("referring_physician"), institution_name=data.get("institution_name"), station_name=data.get("station_name"), physician_name=data.get("physician_name"), procedure_id=data.get("procedure_id"), procedure_description=data.get("procedure_description"), requested_proc_id=data.get("requested_proc_id"), requested_proc_description=data.get("requested_proc_description"), scheduled_date=data.get("scheduled_date"), scheduled_time=data.get("scheduled_time"), scheduled_station_ae=data.get("scheduled_station_ae"), scheduled_performing_physician=data.get("scheduled_performing_physician"), scheduled_proc_step_status=data.get("scheduled_proc_step_status"))
    return jsonify({"id": item_id, "message": "Item created successfully"}), 201

@app.route("/api/worklist/<item_id>", methods=["DELETE"])
def delete_item(item_id):
    if delete_worklist_item(item_id):
        return jsonify({"message": "Item deleted successfully"})
    return jsonify({"error": "Item not found"}), 404

@app.route("/api/worklist/<item_id>", methods=["GET"])
def get_item(item_id):
    item = get_worklist_by_id(item_id)
    if item:
        return jsonify(item)
    return jsonify({"error": "Item not found"}), 404

@app.route("/api/devices", methods=["GET"])
def get_devices():
    return jsonify(all_devices())

@app.route("/api/devices", methods=["POST"])
def create_device():
    data = request.json
    ae = data.get("ae_title")
    host = data.get("host")
    port = data.get("port")
    if not ae or not host or not port:
        return jsonify({"error": "ae_title, host, port required"}), 400
    did = add_device(ae, host, port, data.get("modality"), data.get("station_name"), data.get("description"))
    return jsonify({"id": did, "message": "Device added"}), 201

@app.route("/api/devices/<did>", methods=["DELETE"])
def delete_device(did):
    if del_device(did):
        return jsonify({"message": "Device deleted"})
    return jsonify({"error": "Device not found"}), 404

@app.route("/api/devices/<did>", methods=["GET"])
def get_one_device(did):
    dev = get_device(did)
    if dev:
        return jsonify(dev)
    return jsonify({"error": "Device not found"}), 404

@app.route("/api/push/<item_id>/<device_id>", methods=["POST"])
def push_item_to_device(item_id, device_id):
    item = get_worklist_by_id(item_id)
    if not item:
        return jsonify({"error": "Worklist item not found"}), 404
    result = push_one(item, device_id)
    return jsonify(result)

@app.route("/api/push/<item_id>/all", methods=["POST"])
def push_item_to_all(item_id):
    item = get_worklist_by_id(item_id)
    if not item:
        return jsonify({"error": "Worklist item not found"}), 404
    results = push_all(item)
    return jsonify({"results": results, "total": len(results)})

@app.route("/api/push/history", methods=["GET"])
def get_push_history():
    wid = request.args.get("worklist_item_id")
    did = request.args.get("device_id")
    return jsonify(push_history(wid, did))

@app.route("/api/hl7/parse", methods=["POST"])
def parse_hl7():
    data = request.json
    message = data.get("message")
    if not message:
        return jsonify({"error": "message required"}), 400
    result = parse_hl7_message(message)
    return jsonify(result)

@app.route("/api/hl7/import", methods=["POST"])
def import_hl7():
    data = request.json
    message = data.get("message")
    if not message:
        return jsonify({"error": "message required"}), 400
    parsed = parse_hl7_message(message)
    if not parsed.get("success"):
        return jsonify(parsed), 400
    item_id = create_worklist_from_hl7(parsed["data"])
    if item_id:
        return jsonify({"success": True, "worklist_item_id": item_id, "message": "Imported successfully"})
    return jsonify({"success": False, "message": "Import failed"}), 500

if __name__ == "__main__":
    if not os.path.exists("static"):
        os.makedirs("static")
    app.run(host="0.0.0.0", port=5000, debug=True)
