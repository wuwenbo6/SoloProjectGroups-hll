from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from camera_simulator import CameraSimulator
import os

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

simulator = None

@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    if simulator is None:
        return jsonify({
            'running': False,
            'width': 640,
            'height': 480,
            'fps': 30,
            'pattern': 'gradient',
            'pixel_format': 'RGB24',
            'device': '/dev/video10',
            'num_buffers': 8,
            'bad_pixels': {
                'enabled': False,
                'count': 0,
                'type': 'fixed',
                'value': 0
            },
            'stats': {
                'total_frames': 0,
                'sent_frames': 0,
                'dropped_frames': 0,
                'drop_rate_percent': 0.0,
                'current_output_fps': 0.0,
                'avg_generate_time_ms': 0.0,
                'avg_write_time_ms': 0.0,
                'frame_sequence': 0
            },
            'buffer': {
                'total': 8,
                'current_index': 0
            }
        })
    return jsonify(simulator.get_status())

@app.route('/api/start', methods=['POST'])
def start_simulator():
    global simulator
    data = request.get_json() or {}
    
    device = data.get('device', '/dev/video10')
    width = data.get('width', 640)
    height = data.get('height', 480)
    fps = data.get('fps', 30)
    num_buffers = data.get('num_buffers', 8)
    pixel_format = data.get('pixel_format', 'RGB24')
    
    if pixel_format not in ['RGB24', 'RAW10', 'RAW12']:
        return jsonify({'error': 'Invalid pixel_format. Must be RGB24, RAW10, or RAW12'}), 400
    
    if simulator is not None and simulator.running:
        return jsonify({'error': 'Simulator already running'}), 400
    
    simulator = CameraSimulator(device, width, height, fps, num_buffers, pixel_format)
    simulator.start()
    
    return jsonify({'status': 'started', 'config': simulator.get_status()})

@app.route('/api/stop', methods=['POST'])
def stop_simulator():
    global simulator
    if simulator is None:
        return jsonify({'error': 'Simulator not running'}), 400
    
    simulator.stop()
    simulator = None
    
    return jsonify({'status': 'stopped'})

@app.route('/api/resolution', methods=['POST'])
def set_resolution():
    global simulator
    if simulator is None:
        return jsonify({'error': 'Simulator not running'}), 400
    
    data = request.get_json()
    width = data.get('width')
    height = data.get('height')
    
    if not width or not height:
        return jsonify({'error': 'Width and height are required'}), 400
    
    simulator.set_resolution(width, height)
    
    return jsonify({'status': 'updated', 'width': width, 'height': height})

@app.route('/api/fps', methods=['POST'])
def set_fps():
    global simulator
    if simulator is None:
        return jsonify({'error': 'Simulator not running'}), 400
    
    data = request.get_json()
    fps = data.get('fps')
    
    if not fps:
        return jsonify({'error': 'FPS is required'}), 400
    
    simulator.set_fps(fps)
    
    return jsonify({'status': 'updated', 'fps': fps})

@app.route('/api/pattern', methods=['POST'])
def set_pattern():
    global simulator
    if simulator is None:
        return jsonify({'error': 'Simulator not running'}), 400
    
    data = request.get_json()
    pattern = data.get('pattern')
    
    if not pattern:
        return jsonify({'error': 'Pattern is required'}), 400
    
    simulator.set_pattern(pattern)
    
    return jsonify({'status': 'updated', 'pattern': pattern})

@app.route('/api/buffers', methods=['POST'])
def set_buffers():
    global simulator
    if simulator is None:
        return jsonify({'error': 'Simulator not running'}), 400
    
    data = request.get_json()
    num_buffers = data.get('num_buffers')
    
    if not num_buffers or num_buffers < 1 or num_buffers > 32:
        return jsonify({'error': 'num_buffers must be between 1 and 32'}), 400
    
    simulator.set_num_buffers(num_buffers)
    
    return jsonify({'status': 'updated', 'num_buffers': num_buffers})

@app.route('/api/format', methods=['POST'])
def set_format():
    global simulator
    if simulator is None:
        return jsonify({'error': 'Simulator not running'}), 400
    
    data = request.get_json()
    pixel_format = data.get('pixel_format')
    
    if not pixel_format or pixel_format not in ['RGB24', 'RAW10', 'RAW12']:
        return jsonify({'error': 'pixel_format must be RGB24, RAW10, or RAW12'}), 400
    
    simulator.set_pixel_format(pixel_format)
    
    return jsonify({'status': 'updated', 'pixel_format': pixel_format})

@app.route('/api/bad_pixels', methods=['POST'])
def set_bad_pixels():
    global simulator
    if simulator is None:
        return jsonify({'error': 'Simulator not running'}), 400
    
    data = request.get_json()
    enabled = data.get('enabled', False)
    count = data.get('count', 0)
    pixel_type = data.get('type', 'fixed')
    value = data.get('value', 0)
    seed = data.get('seed', 42)
    
    if pixel_type not in ['fixed', 'random', 'hot', 'dark', 'cluster']:
        return jsonify({'error': 'type must be fixed, random, hot, dark, or cluster'}), 400
    
    if count < 0 or count > 10000:
        return jsonify({'error': 'count must be between 0 and 10000'}), 400
    
    simulator.set_bad_pixels(enabled, count, pixel_type, value, seed)
    
    return jsonify({
        'status': 'updated',
        'bad_pixels': {
            'enabled': enabled,
            'count': count,
            'type': pixel_type,
            'value': value,
            'seed': seed
        }
    })

@app.route('/api/config', methods=['POST'])
def set_config():
    global simulator
    if simulator is None:
        return jsonify({'error': 'Simulator not running'}), 400
    
    data = request.get_json()
    
    if 'width' in data and 'height' in data:
        simulator.set_resolution(data['width'], data['height'])
    
    if 'fps' in data:
        simulator.set_fps(data['fps'])
    
    if 'pattern' in data:
        simulator.set_pattern(data['pattern'])
    
    if 'num_buffers' in data:
        simulator.set_num_buffers(data['num_buffers'])
    
    if 'pixel_format' in data:
        simulator.set_pixel_format(data['pixel_format'])
    
    if 'bad_pixels' in data:
        bp = data['bad_pixels']
        simulator.set_bad_pixels(
            bp.get('enabled', False),
            bp.get('count', 0),
            bp.get('type', 'fixed'),
            bp.get('value', 0),
            bp.get('seed', 42)
        )
    
    return jsonify({'status': 'updated', 'config': simulator.get_status()})

if __name__ == '__main__':
    print("MIPI CSI-2 Camera Simulator")
    print("---------------------------")
    print("Web interface: http://localhost:5000")
    print("API endpoint: http://localhost:5000/api")
    print()
    app.run(host='0.0.0.0', port=5000, debug=False)
