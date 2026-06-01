from flask import Flask, render_template, request, jsonify, Response
from tlp_parser import TLPParser, TLPReplayEngine
import os
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

parser = TLPParser()
replay_engine = TLPReplayEngine()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            packets = parser.parse_file(filepath)
            replay_engine.load_packets(packets)
            return jsonify({
                'success': True,
                'filename': filename,
                'packets': packets,
                'total': len(packets)
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500


@app.route('/api/packets', methods=['GET'])
def get_packets():
    return jsonify({'packets': parser.get_packets()})


@app.route('/api/packet/<int:index>', methods=['GET'])
def get_packet(index):
    packet = parser.get_packet(index)
    if packet:
        return jsonify(packet)
    return jsonify({'error': 'Packet not found'}), 404


@app.route('/api/stats', methods=['GET'])
def get_stats():
    return jsonify(parser.get_statistics())


@app.route('/api/sample', methods=['GET'])
def generate_sample():
    count = request.args.get('count', 20, type=int)
    packets = parser.generate_sample_data(count)
    replay_engine.load_packets(packets)
    return jsonify({
        'success': True,
        'packets': packets,
        'total': len(packets)
    })


@app.route('/api/export/csv', methods=['GET'])
def export_csv():
    csv_data = parser.export_csv()
    return Response(
        csv_data,
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=tlp_packets.csv'}
    )


@app.route('/api/replay/status', methods=['GET'])
def replay_status():
    return jsonify(replay_engine.get_status())


@app.route('/api/replay/reset', methods=['POST'])
def replay_reset():
    replay_engine.reset()
    return jsonify({'success': True, 'status': replay_engine.get_status()})


@app.route('/api/replay/step', methods=['POST'])
def replay_step():
    packet = replay_engine.step()
    return jsonify({
        'success': packet is not None,
        'packet': packet,
        'status': replay_engine.get_status()
    })


@app.route('/api/replay/step_back', methods=['POST'])
def replay_step_back():
    packet = replay_engine.step_back()
    return jsonify({
        'success': packet is not None,
        'packet': packet,
        'status': replay_engine.get_status()
    })


@app.route('/api/replay/goto', methods=['POST'])
def replay_goto():
    data = request.get_json()
    index = data.get('index', 0)
    packet = replay_engine.go_to(index)
    return jsonify({
        'success': packet is not None,
        'packet': packet,
        'status': replay_engine.get_status()
    })


@app.route('/api/replay/simulate_timeout', methods=['POST'])
def replay_simulate_timeout():
    result = replay_engine.simulate_replay_timeout()
    return jsonify({'success': True, 'result': result, 'status': replay_engine.get_status()})


@app.route('/api/replay/simulate_nak', methods=['POST'])
def replay_simulate_nak():
    data = request.get_json()
    sequence = data.get('sequence', 0)
    result = replay_engine.simulate_nak(sequence)
    return jsonify({'success': True, 'result': result, 'status': replay_engine.get_status()})


@app.route('/api/replay/transactions', methods=['GET'])
def replay_transactions():
    return jsonify({'transactions': replay_engine.get_memory_transactions()})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5002)
