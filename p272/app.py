from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import os
import csv
from soundwire_parser import SoundWireParser

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

parser = SoundWireParser()


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/upload', methods=['POST'])
def upload_csv():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and file.filename.endswith('.csv'):
        filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(filepath)
        
        try:
            parsed_data = parser.parse_csv(filepath)
            stats = parser.get_statistics()
            return jsonify({
                'success': True,
                'filename': file.filename,
                'data': parsed_data,
                'statistics': stats
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'Invalid file format'}), 400


@app.route('/api/device-tree', methods=['GET'])
def get_device_tree():
    return jsonify({
        'success': True,
        'device_tree': parser.get_device_tree()
    })


@app.route('/api/register-ops', methods=['GET'])
def get_register_ops():
    return jsonify({
        'success': True,
        'register_ops': parser.get_register_operations()
    })


@app.route('/api/commands', methods=['GET'])
def get_commands():
    return jsonify({
        'success': True,
        'commands': parser.get_parsed_commands()
    })


@app.route('/api/broadcast-commands', methods=['GET'])
def get_broadcast_commands():
    return jsonify({
        'success': True,
        'broadcast_commands': parser.get_broadcast_commands()
    })


@app.route('/api/statistics', methods=['GET'])
def get_statistics():
    return jsonify({
        'success': True,
        'statistics': parser.get_statistics()
    })


@app.route('/api/crc-errors', methods=['GET'])
def get_crc_errors():
    return jsonify({
        'success': True,
        'crc_errors': parser.get_crc_errors()
    })


@app.route('/api/error-injection', methods=['POST'])
def set_error_injection():
    data = request.get_json()
    enabled = data.get('enabled', False)
    rate = float(data.get('rate', 0.1))
    
    if enabled:
        parser.enable_error_injection(rate)
    else:
        parser.disable_error_injection()
    
    return jsonify({
        'success': True,
        'error_injection_enabled': parser.error_injection_enabled,
        'error_injection_rate': parser.error_injection_rate
    })


@app.route('/api/export/commands', methods=['GET'])
def export_commands_csv():
    csv_content = parser.export_commands_to_csv()
    return Response(
        csv_content,
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=soundwire_commands.csv'}
    )


@app.route('/api/export/register-ops', methods=['GET'])
def export_register_ops_csv():
    csv_content = parser.export_register_ops_to_csv()
    return Response(
        csv_content,
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=soundwire_register_ops.csv'}
    )


@app.route('/api/clear', methods=['POST'])
def clear_data():
    parser.clear()
    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
