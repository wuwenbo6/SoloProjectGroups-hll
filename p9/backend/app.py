from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
import threading
import time

from simulation import LennardJonesSimulation
from database import SimulationDatabase

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', 
                    ping_timeout=60, ping_interval=25)

simulation = None
db = SimulationDatabase()
broadcast_thread = None
is_broadcasting = False
rdf_broadcast_thread = None
is_rdf_broadcasting = False

BROADCAST_INTERVAL = 0.05
RDF_BROADCAST_INTERVAL = 0.5
USE_COMPACT_FORMAT = True
XTC_OUTPUT_DIR = 'trajectories'

os.makedirs(XTC_OUTPUT_DIR, exist_ok=True)


def broadcast_state():
    global is_broadcasting
    while is_broadcasting:
        if simulation and simulation.is_running:
            if USE_COMPACT_FORMAT:
                state = simulation.get_state(compact=True)
            else:
                state = simulation.get_state(compact=False)
            socketio.emit('simulation_state', state)
        time.sleep(BROADCAST_INTERVAL)


def broadcast_rdf():
    global is_rdf_broadcasting
    while is_rdf_broadcasting:
        if simulation and simulation.rdf_enabled:
            rdf = simulation.get_rdf()
            if rdf:
                socketio.emit('rdf_data', rdf)
        time.sleep(RDF_BROADCAST_INTERVAL)


def start_broadcast():
    global broadcast_thread, is_broadcasting
    if not is_broadcasting:
        is_broadcasting = True
        broadcast_thread = threading.Thread(target=broadcast_state)
        broadcast_thread.daemon = True
        broadcast_thread.start()


def stop_broadcast():
    global is_broadcasting
    is_broadcasting = False


def start_rdf_broadcast():
    global rdf_broadcast_thread, is_rdf_broadcasting
    if not is_rdf_broadcasting:
        is_rdf_broadcasting = True
        rdf_broadcast_thread = threading.Thread(target=broadcast_rdf)
        rdf_broadcast_thread.daemon = True
        rdf_broadcast_thread.start()


def stop_rdf_broadcast():
    global is_rdf_broadcasting
    is_rdf_broadcasting = False


@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')


@app.route('/api/init', methods=['POST'])
def init_simulation():
    global simulation
    data = request.json
    
    species_configs = data.get('species_configs')
    transition_steps = data.get('transition_steps', 200)
    rdf_enabled = data.get('rdf_enabled', True)
    rdf_bins = data.get('rdf_bins', 100)
    rdf_max_r = data.get('rdf_max_r', 3.0)
    
    simulation = LennardJonesSimulation(
        species_configs=species_configs,
        transition_steps=transition_steps,
        rdf_enabled=rdf_enabled,
        rdf_bins=rdf_bins,
        rdf_max_r=rdf_max_r
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Simulation initialized',
        'state': simulation.get_state(compact=False)
    })


@app.route('/api/start', methods=['POST'])
def start_simulation():
    global simulation
    if simulation is None:
        return jsonify({'status': 'error', 'message': 'Simulation not initialized'}), 400
    
    data = request.json or {}
    steps_per_update = data.get('steps_per_update', 10)
    update_interval = data.get('update_interval', 0.033)
    
    simulation.start(steps_per_update=steps_per_update, update_interval=update_interval)
    start_broadcast()
    if simulation.rdf_enabled:
        start_rdf_broadcast()
    
    return jsonify({'status': 'success', 'message': 'Simulation started'})


@app.route('/api/stop', methods=['POST'])
def stop_simulation():
    global simulation
    if simulation is None:
        return jsonify({'status': 'error', 'message': 'Simulation not initialized'}), 400
    
    simulation.stop()
    stop_broadcast()
    stop_rdf_broadcast()
    
    return jsonify({'status': 'success', 'message': 'Simulation stopped'})


@app.route('/api/reset', methods=['POST'])
def reset_simulation():
    global simulation
    if simulation is None:
        return jsonify({'status': 'error', 'message': 'Simulation not initialized'}), 400
    
    simulation.reset()
    stop_rdf_broadcast()
    
    return jsonify({
        'status': 'success',
        'message': 'Simulation reset',
        'state': simulation.get_state(compact=False)
    })


@app.route('/api/state', methods=['GET'])
def get_state():
    global simulation
    if simulation is None:
        return jsonify({'status': 'error', 'message': 'Simulation not initialized'}), 400
    
    compact = request.args.get('compact', 'false').lower() == 'true'
    
    return jsonify({
        'status': 'success',
        'state': simulation.get_state(compact=compact)
    })


@app.route('/api/parameters', methods=['POST'])
def update_parameters():
    global simulation
    if simulation is None:
        return jsonify({'status': 'error', 'message': 'Simulation not initialized'}), 400
    
    data = request.json
    temperature = data.get('temperature')
    pressure = data.get('pressure')
    species_params = data.get('species_params')
    
    simulation.update_global_parameters(
        temperature=temperature,
        pressure=pressure
    )
    
    if species_params:
        for idx, params in enumerate(species_params):
            simulation.update_species_parameters(
                species_idx=idx,
                epsilon=params.get('epsilon'),
                sigma=params.get('sigma')
            )
    
    return jsonify({
        'status': 'success',
        'message': 'Parameters updated (smooth transition)',
    })


@app.route('/api/rdf', methods=['GET'])
def get_rdf():
    global simulation
    if simulation is None:
        return jsonify({'status': 'error', 'message': 'Simulation not initialized'}), 400
    
    rdf = simulation.get_rdf()
    return jsonify({
        'status': 'success',
        'rdf': rdf
    })


@app.route('/api/rdf/reset', methods=['POST'])
def reset_rdf():
    global simulation
    if simulation is None:
        return jsonify({'status': 'error', 'message': 'Simulation not initialized'}), 400
    
    simulation.reset_rdf()
    return jsonify({'status': 'success', 'message': 'RDF calculator reset'})


@app.route('/api/record/start', methods=['POST'])
def start_recording():
    global simulation
    if simulation is None:
        return jsonify({'status': 'error', 'message': 'Simulation not initialized'}), 400
    
    data = request.json or {}
    filename = data.get('filename', f'trajectory_{int(time.time())}.xtc')
    filepath = os.path.join(XTC_OUTPUT_DIR, filename)
    
    simulation.start_recording(filepath)
    
    return jsonify({
        'status': 'success',
        'message': 'Recording started',
        'filename': filename
    })


@app.route('/api/record/stop', methods=['POST'])
def stop_recording():
    global simulation
    if simulation is None:
        return jsonify({'status': 'error', 'message': 'Simulation not initialized'}), 400
    
    simulation.stop_recording()
    
    return jsonify({
        'status': 'success',
        'message': 'Recording stopped'
    })


@app.route('/api/record/status', methods=['GET'])
def recording_status():
    global simulation
    if simulation is None:
        return jsonify({'status': 'error', 'message': 'Simulation not initialized'}), 400
    
    return jsonify({
        'status': 'success',
        'recording': simulation.is_recording
    })


@app.route('/api/trajectories', methods=['GET'])
def list_trajectories():
    files = []
    if os.path.exists(XTC_OUTPUT_DIR):
        for f in os.listdir(XTC_OUTPUT_DIR):
            if f.endswith('.xtc'):
                filepath = os.path.join(XTC_OUTPUT_DIR, f)
                size = os.path.getsize(filepath)
                files.append({
                    'name': f,
                    'size': size,
                    'size_mb': round(size / 1024 / 1024, 2)
                })
    
    return jsonify({'status': 'success', 'files': files})


@app.route('/api/trajectories/<filename>', methods=['GET'])
def download_trajectory(filename):
    filepath = os.path.join(XTC_OUTPUT_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'status': 'error', 'message': 'File not found'}), 404
    
    return send_file(filepath, as_attachment=True, download_name=filename)


@app.route('/api/trajectories/<filename>', methods=['DELETE'])
def delete_trajectory(filename):
    filepath = os.path.join(XTC_OUTPUT_DIR, filename)
    if not os.path.exists(filepath):
        return jsonify({'status': 'error', 'message': 'File not found'}), 404
    
    os.remove(filepath)
    return jsonify({'status': 'success', 'message': 'File deleted'})


@app.route('/api/configs', methods=['GET'])
def get_configs():
    configs = db.get_all_configs()
    return jsonify({'status': 'success', 'configs': configs})


@app.route('/api/configs', methods=['POST'])
def save_config():
    data = request.json
    
    config_id = db.save_config(
        name=data.get('name', 'Unnamed Config'),
        temperature=data.get('temperature', 300.0),
        pressure=data.get('pressure', 1.0),
        epsilon=data.get('epsilon', 1.0),
        sigma=data.get('sigma', 0.34),
        num_particles=data.get('num_particles', 216)
    )
    
    return jsonify({'status': 'success', 'config_id': config_id})


@app.route('/api/configs/<int:config_id>', methods=['GET'])
def get_config(config_id):
    config = db.get_config(config_id)
    if config:
        return jsonify({'status': 'success', 'config': config})
    return jsonify({'status': 'error', 'message': 'Config not found'}), 404


@app.route('/api/configs/<int:config_id>', methods=['PUT'])
def update_config(config_id):
    data = request.json
    success = db.update_config(config_id, **data)
    
    if success:
        return jsonify({'status': 'success', 'message': 'Config updated'})
    return jsonify({'status': 'error', 'message': 'Failed to update config'}), 400


@app.route('/api/configs/<int:config_id>', methods=['DELETE'])
def delete_config(config_id):
    db.delete_config(config_id)
    return jsonify({'status': 'success', 'message': 'Config deleted'})


@app.route('/api/configs/<int:config_id>/load', methods=['POST'])
def load_config(config_id):
    global simulation
    config = db.get_config(config_id)
    
    if not config:
        return jsonify({'status': 'error', 'message': 'Config not found'}), 404
    
    species_configs = [{
        'name': 'Ar',
        'count': config['num_particles'],
        'epsilon': config['epsilon'],
        'sigma': config['sigma'],
        'mass': 39.95,
        'color': '#00d4ff'
    }]
    
    simulation = LennardJonesSimulation(
        species_configs=species_configs
    )
    
    return jsonify({
        'status': 'success',
        'message': 'Config loaded',
        'state': simulation.get_state(compact=False)
    })


@socketio.on('connect')
def handle_connect():
    print('Client connected')
    if simulation:
        emit('simulation_state', simulation.get_state(compact=False))
        if simulation.rdf_enabled:
            emit('rdf_data', simulation.get_rdf())


@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=8080, debug=True, allow_unsafe_werkzeug=True)
