#!/usr/bin/env python3

from flask import Flask, jsonify, render_template, request, Response
from pcie_ats_simulator import PCIeSimulator
import threading
import time

app = Flask(__name__)

simulator = PCIeSimulator(system_page_size=0x1000, auto_invalidate_interval=30.0, pasid_enabled=True)
simulator.initialize_demo_mappings()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/state')
def get_state():
    return jsonify(simulator.get_state())


@app.route('/api/mappings')
def get_mappings():
    return jsonify(simulator.get_state()['mappings'])


@app.route('/api/devices')
def get_devices():
    return jsonify(simulator.get_state()['devices'])


@app.route('/api/transactions')
def get_transactions():
    return jsonify(simulator.get_state()['transactions'])


@app.route('/api/invalidate_log')
def get_invalidate_log():
    return jsonify(simulator.get_state()['invalidate_log'])


@app.route('/api/pasid_contexts')
def get_pasid_contexts():
    return jsonify(simulator.get_state()['pasid_contexts'])


@app.route('/api/system_info')
def get_system_info():
    state = simulator.get_state()
    return jsonify({
        "system_page_size": state['system_page_size'],
        "pasid_enabled": state['pasid_enabled'],
        "auto_invalidate_interval": state['auto_invalidate_interval'],
        "auto_invalidate_enabled": state['auto_invalidate_enabled']
    })


@app.route('/api/stats')
def get_stats():
    return jsonify(simulator.get_stats())


@app.route('/api/stats/export')
def export_stats():
    fmt = request.args.get('format', 'json')
    content = simulator.export_stats(fmt)
    
    if fmt == 'json':
        return Response(content, mimetype='application/json')
    elif fmt == 'csv':
        return Response(
            content,
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=pcie_ats_stats.csv'}
        )
    else:
        return jsonify({"error": f"Unsupported format: {fmt}"}), 400


@app.route('/api/stats/reset', methods=['POST'])
def reset_stats():
    simulator.reset_stats()
    return jsonify({"status": "success"})


@app.route('/api/pasid/create', methods=['POST'])
def create_pasid():
    data = request.json
    pasid = data.get('pasid')
    process_name = data.get('process_name', '')
    
    if pasid is None:
        return jsonify({"status": "error", "message": "PASID is required"}), 400
    
    try:
        simulator.create_pasid(int(pasid), process_name)
        return jsonify({"status": "success", "pasid": pasid, "process_name": process_name})
    except ValueError as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route('/api/device/create', methods=['POST'])
def create_device():
    data = request.json
    device_id = data.get('device_id', f'device_{int(time.time())}')
    page_size = data.get('page_size')
    supported_pasids = data.get('supported_pasids', None)
    
    if page_size:
        page_size = int(page_size, 16) if isinstance(page_size, str) else page_size
    
    if supported_pasids:
        supported_pasids = [int(p) for p in supported_pasids]
    
    device = simulator.create_device(device_id, page_size, supported_pasids)
    return jsonify({
        "status": "success",
        "device_id": device_id,
        "device_page_size": hex(device.get_device_page_size())
    })


@app.route('/api/device/ats_request', methods=['POST'])
def ats_request():
    data = request.json
    device_id = data.get('device_id')
    iova = int(data.get('iova', 0), 16) if isinstance(data.get('iova'), str) else data.get('iova', 0)
    page_size = data.get('page_size')
    pasid = data.get('pasid')
    
    if page_size:
        page_size = int(page_size, 16) if isinstance(page_size, str) else page_size
    
    if pasid is not None:
        pasid = int(pasid)
    
    if device_id not in simulator.root_complex.devices:
        return jsonify({"status": "error", "message": "Device not found"}), 404
    
    device = simulator.root_complex.devices[device_id]
    result = device.ats_translate(iova, page_size=page_size, pasid=pasid)
    
    if result:
        return jsonify({
            "status": "success",
            "iova": hex(iova),
            "pasid": pasid,
            "hpa": hex(result)
        })
    else:
        history = device.get_request_history(1)
        error_msg = history[-1].get('reason', 'Translation failed') if history else 'Translation failed'
        return jsonify({
            "status": "failed",
            "iova": hex(iova),
            "pasid": pasid,
            "message": error_msg
        })


@app.route('/api/mapping/add', methods=['POST'])
def add_mapping():
    data = request.json
    iova = int(data.get('iova', 0), 16) if isinstance(data.get('iova'), str) else data.get('iova', 0)
    hpa = int(data.get('hpa', 0), 16) if isinstance(data.get('hpa'), str) else data.get('hpa', 0)
    size = int(data.get('size', 0x1000), 16) if isinstance(data.get('size'), str) else data.get('size', 0x1000)
    page_size = data.get('page_size')
    if page_size:
        page_size = int(page_size, 16) if isinstance(page_size, str) else page_size
    permissions = data.get('permissions', 'rw-')
    pasid = data.get('pasid')
    if pasid is not None:
        pasid = int(pasid)
    
    simulator.root_complex.add_memory_mapping(iova, hpa, size, page_size, permissions, pasid)
    return jsonify({"status": "success"})


@app.route('/api/mapping/remove', methods=['POST'])
def remove_mapping():
    data = request.json
    iova = int(data.get('iova', 0), 16) if isinstance(data.get('iova'), str) else data.get('iova', 0)
    pasid = data.get('pasid')
    if pasid is not None:
        pasid = int(pasid)
    
    simulator.root_complex.invalidate_address(iova, pasid)
    return jsonify({"status": "success"})


@app.route('/api/invalidate/broadcast', methods=['POST'])
def broadcast_invalidate():
    data = request.json
    invalidate_type = data.get('type', 'global')
    target_iova = data.get('iova')
    target_pasid = data.get('pasid')
    
    if target_iova:
        target_iova = int(target_iova, 16) if isinstance(target_iova, str) else target_iova
    if target_pasid is not None:
        target_pasid = int(target_pasid)
    
    message_id = simulator.broadcast_invalidate(invalidate_type, target_iova, target_pasid)
    return jsonify({"status": "success", "message_id": message_id})


@app.route('/api/invalidate/device', methods=['POST'])
def invalidate_device():
    data = request.json
    device_id = data.get('device_id')
    invalidate_type = data.get('type', 'global')
    target_iova = data.get('iova')
    target_pasid = data.get('pasid')
    
    if target_iova:
        target_iova = int(target_iova, 16) if isinstance(target_iova, str) else target_iova
    if target_pasid is not None:
        target_pasid = int(target_pasid)
    
    success = simulator.send_invalidate_to_device(device_id, invalidate_type, target_iova, target_pasid)
    if success:
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error", "message": "Device not found"}), 404


@app.route('/api/traffic/generate', methods=['POST'])
def generate_traffic():
    data = request.json
    device_id = data.get('device_id')
    num_requests = data.get('num_requests', 10)
    use_pasids = data.get('use_pasids', False)
    
    if device_id not in simulator.root_complex.devices:
        return jsonify({"status": "error", "message": "Device not found"}), 404
    
    device = simulator.root_complex.devices[device_id]
    
    def run_traffic():
        simulator.generate_random_traffic(device, num_requests, use_pasids)
    
    thread = threading.Thread(target=run_traffic, daemon=True)
    thread.start()
    
    return jsonify({"status": "success", "message": f"Generating {num_requests} requests"})


@app.route('/api/simulation/reset', methods=['POST'])
def reset_simulation():
    global simulator
    simulator = PCIeSimulator(system_page_size=0x1000, auto_invalidate_interval=30.0, pasid_enabled=True)
    simulator.initialize_demo_mappings()
    return jsonify({"status": "success"})


@app.route('/api/simulation/auto_invalidate/toggle', methods=['POST'])
def toggle_auto_invalidate():
    data = request.json
    enabled = data.get('enabled', True)
    interval = data.get('interval')
    
    if enabled:
        if interval:
            simulator.root_complex.auto_invalidate_interval = float(interval)
        simulator.root_complex.start_auto_invalidate()
    else:
        simulator.root_complex.stop_auto_invalidate()
    
    return jsonify({
        "status": "success",
        "enabled": simulator.root_complex.auto_invalidate_enabled,
        "interval": simulator.root_complex.auto_invalidate_interval
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=9999)
