from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
from simulation_engine import SimulationEngine
import threading
import time
from datetime import datetime

app = Flask(__name__)
CORS(app)

engine = SimulationEngine()
simulation_thread = None


@app.route('/api/cells', methods=['GET'])
def get_cells():
    return jsonify(engine.get_cells_response())


@app.route('/api/simulation/start', methods=['POST'])
def start_simulation():
    engine.running = True
    return jsonify(engine.get_status())


@app.route('/api/simulation/pause', methods=['POST'])
def pause_simulation():
    engine.running = False
    return jsonify(engine.get_status())


@app.route('/api/simulation/reset', methods=['POST'])
def reset_simulation():
    engine.running = False
    engine.reset()
    return jsonify(engine.get_status())


@app.route('/api/simulation/step', methods=['POST'])
def step_simulation():
    engine.step()
    return jsonify(engine.get_status())


@app.route('/api/simulation/status', methods=['GET'])
def get_status():
    return jsonify(engine.get_status())


@app.route('/api/simulation/config', methods=['POST', 'GET'])
def simulation_config():
    if request.method == 'POST':
        data = request.get_json()
        engine.update_config(data)
        return jsonify(engine.get_status())
    else:
        return jsonify(engine.config)


@app.route('/api/logs', methods=['GET'])
def get_logs():
    return jsonify(engine.get_logs())


@app.route('/api/logs/export/csv', methods=['GET'])
def export_logs_csv():
    csv_data = engine.export_logs_csv()
    response = make_response(csv_data)
    response.headers["Content-Disposition"] = f"attachment; filename=nbiot_reselection_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    response.headers["Content-type"] = "text/csv"
    return response


@app.route('/api/logs/export/json', methods=['GET'])
def export_logs_json():
    json_data = engine.export_logs_json()
    response = make_response(json_data)
    response.headers["Content-Disposition"] = f"attachment; filename=nbiot_reselection_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    response.headers["Content-type"] = "application/json"
    return response


def run_simulation_loop():
    while True:
        if engine.running:
            engine.step()
            time.sleep(engine.config['speed'] / 1000.0)
        else:
            time.sleep(0.1)


if __name__ == '__main__':
    simulation_thread = threading.Thread(target=run_simulation_loop, daemon=True)
    simulation_thread.start()
    app.run(host='0.0.0.0', port=5001, debug=False)
