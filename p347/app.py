from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
from storage_tier import TieredStorageSimulator, TierType, BLOCK_SIZE
import os

app = Flask(__name__, static_folder='static')
CORS(app)

simulator = TieredStorageSimulator(
    ssd_capacity=100 * 1024 * 1024 * 1024,
    sas_capacity=500 * 1024 * 1024 * 1024,
    sata_capacity=2000 * 1024 * 1024 * 1024
)


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify(simulator.get_status())


@app.route('/api/blocks/<tier>', methods=['GET'])
def get_blocks(tier):
    tier_map = {
        'ssd': TierType.SSD,
        'sas': TierType.SAS,
        'sata': TierType.SATA
    }
    if tier not in tier_map:
        return jsonify({'error': 'Invalid tier type'}), 400
    blocks = simulator.get_blocks_by_tier(tier_map[tier])
    return jsonify({'blocks': blocks})


@app.route('/api/blocks', methods=['POST'])
def create_block():
    data = request.get_json()
    block_id = data.get('id')
    size = data.get('size', BLOCK_SIZE)
    tier = data.get('tier', 'sata')
    preferred_tier_str = data.get('preferred_tier', None)

    if not block_id:
        return jsonify({'error': 'Block id is required'}), 400

    tier_map = {
        'ssd': TierType.SSD,
        'sas': TierType.SAS,
        'sata': TierType.SATA
    }

    if tier not in tier_map:
        return jsonify({'error': 'Invalid tier type'}), 400

    preferred_tier = tier_map.get(preferred_tier_str) if preferred_tier_str else None

    success = simulator.create_block(block_id, size, tier_map[tier], preferred_tier)
    if success:
        return jsonify({
            'message': 'Block created successfully',
            'block_id': block_id,
            'size': size,
            'preferred_tier': preferred_tier_str
        })
    else:
        return jsonify({'error': 'Failed to create block'}), 400


@app.route('/api/access/<block_id>', methods=['POST'])
def access_block(block_id):
    success = simulator.access_block(block_id)
    if success:
        return jsonify({'message': 'Block accessed successfully', 'block_id': block_id})
    else:
        return jsonify({'error': 'Block not found'}), 404


@app.route('/api/migrate/<block_id>/<target_tier>', methods=['POST'])
def migrate_block(block_id, target_tier):
    tier_map = {
        'ssd': TierType.SSD,
        'sas': TierType.SAS,
        'sata': TierType.SATA
    }

    if target_tier not in tier_map:
        return jsonify({'error': 'Invalid tier type'}), 400

    success = simulator.migrate_block(block_id, tier_map[target_tier])
    if success:
        return jsonify({
            'message': 'Block migrated (copy + atomic switch) successfully',
            'block_id': block_id,
            'target_tier': target_tier
        })
    else:
        return jsonify({'error': 'Failed to migrate block'}), 400


@app.route('/api/auto-tier', methods=['POST'])
def auto_tier():
    simulator.perform_auto_tiering()
    return jsonify({'message': 'Auto-tiering performed successfully'})


@app.route('/api/simulate-access', methods=['POST'])
def simulate_access():
    data = request.get_json() or {}
    num_accesses = data.get('num_accesses', 100)
    simulator.simulate_random_access(num_accesses)
    return jsonify({'message': f'Simulated {num_accesses} random accesses'})


@app.route('/api/simulate-time-advance', methods=['POST'])
def simulate_time_advance():
    data = request.get_json() or {}
    advance_seconds = data.get('advance_seconds', 60)
    simulator.simulate_time_advance(advance_seconds)
    return jsonify({'message': f'Time advanced by {advance_seconds} seconds'})


@app.route('/api/set-preferred-tier/<block_id>', methods=['POST'])
def set_preferred_tier(block_id):
    data = request.get_json() or {}
    preferred_tier_str = data.get('preferred_tier', None)

    tier_map = {
        'ssd': TierType.SSD,
        'sas': TierType.SAS,
        'sata': TierType.SATA
    }

    preferred_tier = tier_map.get(preferred_tier_str) if preferred_tier_str else None

    success = simulator.set_preferred_tier(block_id, preferred_tier)
    if success:
        return jsonify({
            'message': f'Preferred tier set to {preferred_tier_str or "auto"}',
            'block_id': block_id,
            'preferred_tier': preferred_tier_str
        })
    else:
        return jsonify({'error': 'Block not found'}), 404


@app.route('/api/report', methods=['GET'])
def export_report():
    fmt = request.args.get('format', 'json')
    if fmt not in ('json', 'csv'):
        return jsonify({'error': 'Invalid format, use json or csv'}), 400

    content = simulator.generate_report(fmt)

    if fmt == 'csv':
        return Response(
            content,
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=migration_report.csv'}
        )

    return Response(
        content,
        mimetype='application/json',
        headers={'Content-Disposition': 'attachment; filename=migration_report.json'}
    )


@app.route('/api/reset', methods=['POST'])
def reset_simulator():
    global simulator
    data = request.get_json() or {}
    ssd_capacity = data.get('ssd_capacity', 100 * 1024 * 1024 * 1024)
    sas_capacity = data.get('sas_capacity', 500 * 1024 * 1024 * 1024)
    sata_capacity = data.get('sata_capacity', 2000 * 1024 * 1024 * 1024)
    heat_threshold_high = data.get('heat_threshold_high', 0.7)
    heat_threshold_low = data.get('heat_threshold_low', 0.3)

    simulator = TieredStorageSimulator(
        ssd_capacity=ssd_capacity,
        sas_capacity=sas_capacity,
        sata_capacity=sata_capacity,
        heat_threshold_high=heat_threshold_high,
        heat_threshold_low=heat_threshold_low
    )
    return jsonify({'message': 'Simulator reset successfully'})


@app.route('/api/init-demo', methods=['POST'])
def init_demo():
    global simulator
    simulator = TieredStorageSimulator(
        ssd_capacity=100 * 1024 * 1024 * 1024,
        sas_capacity=500 * 1024 * 1024 * 1024,
        sata_capacity=2000 * 1024 * 1024 * 1024
    )

    import random
    num_blocks = 200
    for i in range(num_blocks):
        block_size = BLOCK_SIZE
        simulator.create_block(f'blk_{i:04d}', block_size, TierType.SATA)

    return jsonify({'message': f'Demo initialized with {num_blocks} blocks (1MB each)'})


if __name__ == '__main__':
    os.makedirs('static', exist_ok=True)
    app.run(debug=True, host='0.0.0.0', port=5001)
