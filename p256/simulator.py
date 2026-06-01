from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from cm_device import ChannelManager
import os
import json

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

channel_manager = ChannelManager(num_channels=4)


@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/api/channels', methods=['GET'])
def get_channels():
    channels = channel_manager.get_all_channels_status()
    return jsonify({'channels': channels})


@app.route('/api/channels/<int:channel_id>', methods=['PUT'])
def update_channel(channel_id):
    data = request.json
    channel = None
    for ch in channel_manager.channels:
        if ch.channel_id == channel_id:
            channel = ch
            break
    
    if not channel:
        return jsonify({'error': 'Channel not found'}), 404
    
    if 'modulation' in data:
        channel.set_modulation(data['modulation'])
    if 'snr_db' in data:
        channel.set_snr(float(data['snr_db']))
    
    return jsonify({'channel': channel.get_status()})


@app.route('/api/cms', methods=['GET'])
def get_cms():
    cms = channel_manager.get_all_cm_status()
    return jsonify({'cms': cms})


@app.route('/api/cms', methods=['POST'])
def create_cm():
    data = request.json
    cm_id = data.get('cm_id')
    name = data.get('name', f'CM-{cm_id}')
    
    if not cm_id:
        return jsonify({'error': 'cm_id is required'}), 400
    
    cm = channel_manager.create_cm(cm_id, name)
    if not cm:
        return jsonify({'error': 'CM already exists'}), 400
    
    return jsonify({'cm': cm.get_status()})


@app.route('/api/cms/<cm_id>/bind', methods=['POST'])
def bind_channels(cm_id):
    data = request.json
    channel_ids = data.get('channel_ids', [])
    
    if not channel_ids:
        return jsonify({'error': 'channel_ids is required'}), 400
    
    success = channel_manager.bind_cm_to_channels(cm_id, channel_ids)
    if not success:
        return jsonify({'error': 'Failed to bind channels'}), 400
    
    return jsonify({'cm': channel_manager.get_cm_status(cm_id)})


@app.route('/api/cms/<cm_id>/unbind', methods=['POST'])
def unbind_channels(cm_id):
    success = channel_manager.unbind_cm_channels(cm_id)
    if not success:
        return jsonify({'error': 'CM not found'}), 404
    
    return jsonify({'cm': channel_manager.get_cm_status(cm_id)})


@app.route('/api/cms/<cm_id>/bonding', methods=['PUT'])
def set_bonding(cm_id):
    data = request.json
    enabled = data.get('enabled', True)
    
    success = channel_manager.set_cm_bonding(cm_id, enabled)
    if not success:
        return jsonify({'error': 'CM not found'}), 404
    
    return jsonify({'cm': channel_manager.get_cm_status(cm_id)})


@app.route('/api/simulate/<cm_id>', methods=['POST'])
def simulate(cm_id):
    data = request.json or {}
    duration = data.get('duration_seconds', 1)
    data_rate = data.get('data_rate', 100e6)
    
    result = channel_manager.run_simulation(cm_id, duration, data_rate)
    if not result:
        return jsonify({'error': 'CM not found'}), 404
    
    return jsonify(result)


@app.route('/api/simulate/comparison/<cm_id>', methods=['GET'])
def get_comparison(cm_id):
    cm = channel_manager.cm_devices.get(cm_id)
    if not cm:
        return jsonify({'error': 'CM not found'}), 404
    
    channels = cm.bound_channels
    if not channels:
        return jsonify({'error': 'CM has no bound channels'}), 400
    
    snr_range = list(range(5, 31, 2))
    no_bonding_throughput = []
    with_bonding_throughput = []
    
    for snr in snr_range:
        for ch in channels:
            ch.set_snr(snr)
        
        cm.disable_bonding()
        no_bonding = cm.get_effective_throughput()
        
        cm.enable_bonding()
        with_bonding = cm.get_effective_throughput()
        
        no_bonding_throughput.append(no_bonding / 1e6)
        with_bonding_throughput.append(with_bonding / 1e6)
    
    return jsonify({
        'cm_id': cm_id,
        'snr_range': snr_range,
        'no_bonding_throughput_mbps': no_bonding_throughput,
        'with_bonding_throughput_mbps': with_bonding_throughput,
        'bound_channels': [ch.channel_id for ch in channels],
        'channel_count': len(channels)
    })


@app.route('/api/interference', methods=['GET'])
def get_interference_matrix():
    matrix = channel_manager.get_interference_matrix()
    return jsonify(matrix)


@app.route('/api/interference', methods=['PUT'])
def set_interference():
    data = request.json
    channel_i = data.get('channel_i')
    channel_j = data.get('channel_j')
    attenuation_db = data.get('attenuation_db')
    
    if channel_i is None or channel_j is None or attenuation_db is None:
        return jsonify({'error': 'channel_i, channel_j, and attenuation_db are required'}), 400
    
    channel_manager.set_interference(channel_i, channel_j, attenuation_db)
    return jsonify(channel_manager.get_interference_matrix())


@app.route('/api/interference/matrix', methods=['PUT'])
def set_interference_matrix():
    data = request.json
    matrix = data.get('matrix')
    
    if not matrix:
        return jsonify({'error': 'matrix is required'}), 400
    
    for i in range(len(matrix)):
        for j in range(len(matrix[i])):
            channel_manager.set_interference(i, j, float(matrix[i][j]))
    
    return jsonify(channel_manager.get_interference_matrix())


@app.route('/api/reset', methods=['POST'])
def reset():
    global channel_manager
    channel_manager = ChannelManager(num_channels=4)
    return jsonify({'message': 'Simulation reset successfully'})


@app.route('/api/loadbalancer', methods=['GET'])
def get_load_balancer():
    status = channel_manager.get_load_balancer_status()
    return jsonify(status)


@app.route('/api/loadbalancer/strategy', methods=['PUT'])
def set_load_balance_strategy():
    data = request.json
    strategy = data.get('strategy')
    if not strategy:
        return jsonify({'error': 'strategy is required'}), 400
    
    success = channel_manager.set_load_balance_strategy(strategy)
    if not success:
        return jsonify({'error': f'Invalid strategy: {strategy}. Valid: round_robin, least_loaded, best_snr, weighted'}), 400
    
    return jsonify(channel_manager.get_load_balancer_status())


@app.route('/api/loadbalancer/thresholds', methods=['PUT'])
def set_utilization_thresholds():
    data = request.json
    high = data.get('high', 80)
    low = data.get('low', 20)
    
    channel_manager.set_utilization_thresholds(high, low)
    return jsonify(channel_manager.get_load_balancer_status())


@app.route('/api/cms/<cm_id>/auto_bind', methods=['POST'])
def auto_bind_channels(cm_id):
    data = request.json or {}
    target_count = data.get('target_count', 4)
    
    result = channel_manager.auto_bind_channels(cm_id, target_count)
    if result is None:
        return jsonify({'error': 'CM not found'}), 404
    
    return jsonify(result)


@app.route('/api/cms/<cm_id>/rebalance', methods=['POST'])
def rebalance_channels(cm_id):
    result = channel_manager.check_and_rebalance(cm_id)
    if result is None:
        return jsonify({'error': 'CM not found'}), 404
    
    return jsonify(result)


@app.route('/api/channels/utilization', methods=['GET'])
def get_channel_utilizations():
    utilizations = channel_manager.get_channel_utilizations()
    return jsonify({'utilizations': utilizations})


@app.route('/api/report/<cm_id>', methods=['GET'])
def get_cm_report(cm_id):
    fmt = request.args.get('format', 'json')
    
    report = channel_manager.generate_report(cm_id)
    if report is None:
        return jsonify({'error': 'CM not found'}), 404
    
    if fmt == 'download':
        json_str = json.dumps(report, indent=2, ensure_ascii=False)
        filename = f"channel_bonding_report_{cm_id}_{report['report_id']}.json"
        return Response(
            json_str,
            mimetype='application/json',
            headers={'Content-Disposition': f'attachment; filename={filename}'}
        )
    
    return jsonify(report)


@app.route('/api/report', methods=['GET'])
def get_full_report():
    fmt = request.args.get('format', 'json')
    
    report = channel_manager.generate_full_report()
    
    if fmt == 'download':
        json_str = json.dumps(report, indent=2, ensure_ascii=False)
        filename = f"channel_bonding_full_report_{report['report_id']}.json"
        return Response(
            json_str,
            mimetype='application/json',
            headers={'Content-Disposition': f'attachment; filename={filename}'}
        )
    
    return jsonify(report)


if __name__ == '__main__':
    os.makedirs('static', exist_ok=True)
    app.run(host='0.0.0.0', port=5001, debug=True)
