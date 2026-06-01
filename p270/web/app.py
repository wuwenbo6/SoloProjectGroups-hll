from flask import Flask, render_template, jsonify
from flask_socketio import SocketIO
import threading
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = 'iscsi-target-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

iscsi_target = None

def set_iscsi_target(target):
    global iscsi_target
    iscsi_target = target

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/sessions')
def get_sessions():
    if iscsi_target:
        sessions = iscsi_target.get_sessions()
        return jsonify(sessions)
    return jsonify([])

@app.route('/api/luns')
def get_luns():
    if iscsi_target:
        luns = iscsi_target.get_luns()
        return jsonify(luns)
    return jsonify([])

@app.route('/api/status')
def get_status():
    if iscsi_target:
        return jsonify({
            'running': iscsi_target.running,
            'target_name': iscsi_target.target_name,
            'host': iscsi_target.host,
            'port': iscsi_target.port,
            'session_count': len(iscsi_target.get_sessions()),
            'lun_count': len(iscsi_target.get_luns())
        })
    return jsonify({'running': False})

def broadcast_status():
    while True:
        if iscsi_target:
            socketio.emit('status_update', {
                'sessions': iscsi_target.get_sessions(),
                'luns': iscsi_target.get_luns()
            })
        time.sleep(2)

def start_broadcast_thread():
    thread = threading.Thread(target=broadcast_status, daemon=True)
    thread.start()

def run_web_server(host='0.0.0.0', port=5000):
    start_broadcast_thread()
    socketio.run(app, host=host, port=port, debug=False, use_reloader=False)
