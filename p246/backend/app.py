import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, render_template, jsonify, request, make_response
from flask_socketio import SocketIO, emit
from packet_capture import WEPCapture
from simulator import WEPCaptureSimulator
from wep_cracker import WEPCracker
from ptw_cracker import PTWCracker
from arp_injector import ARPInjector
import threading
import time
from concurrent.futures import ThreadPoolExecutor


app = Flask(__name__, template_folder='../templates', static_folder='../static')
app.config['SECRET_KEY'] = 'wep-cracker-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

USE_SIMULATOR = True

if USE_SIMULATOR:
    wep_capture = WEPCaptureSimulator()
else:
    wep_capture = WEPCapture()

fms_cracker = WEPCracker()
ptw_cracker = PTWCracker()
arp_injector = ARPInjector()

status_lock = threading.Lock()
executor = ThreadPoolExecutor(max_workers=4)


def on_iv_captured(total_ivs, weak_ivs):
    socketio.emit('iv_update', {
        'total_ivs': total_ivs,
        'weak_ivs': weak_ivs
    })


def on_fms_progress(progress, key):
    socketio.emit('crack_progress', {
        'algorithm': 'fms',
        'progress': progress,
        'key': key
    })


def on_ptw_progress(progress, key):
    socketio.emit('crack_progress', {
        'algorithm': 'ptw',
        'progress': progress,
        'key': key
    })


def on_inject_sent(iv, count):
    socketio.emit('inject_update', {
        'packets_sent': count,
        'last_iv': f'{iv[0]:02X}:{iv[1]:02X}:{iv[2]:02X}'
    })


wep_capture.on_iv_captured = on_iv_captured
fms_cracker.on_progress_update = on_fms_progress
ptw_cracker.on_progress_update = on_ptw_progress


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/status')
def get_status():
    capture_stats = wep_capture.get_stats()
    fms_status = fms_cracker.get_status()
    ptw_status = ptw_cracker.get_status()
    inject_stats = arp_injector.get_stats()
    return jsonify({
        'capture': capture_stats,
        'fms': fms_status,
        'ptw': ptw_status,
        'inject': {
            **inject_stats,
            'is_injecting': arp_injector.is_injecting
        }
    })


@app.route('/api/interfaces')
def get_interfaces():
    try:
        from scapy.all import get_if_list
        interfaces = get_if_list()
        return jsonify({'interfaces': interfaces})
    except Exception:
        return jsonify({'interfaces': ['wlan0', 'wlan1', 'mon0']})


@app.route('/api/start_capture', methods=['POST'])
def start_capture():
    data = request.json
    interface = data.get('interface', 'wlan0')
    bssid = data.get('bssid', None)

    wep_capture.start_capture(interface, bssid)

    return jsonify({'status': 'started'})


@app.route('/api/stop_capture', methods=['POST'])
def stop_capture():
    wep_capture.stop_capture()
    return jsonify({'status': 'stopped'})


@app.route('/api/start_crack', methods=['POST'])
def start_crack():
    data = request.json
    key_length = data.get('key_length', 5)
    algorithm = data.get('algorithm', 'ptw')

    if algorithm == 'fms':
        fms_cracker.start_cracking(wep_capture.get_weak_ivs_list, key_length)
    elif algorithm == 'ptw':
        ptw_cracker.start_cracking(wep_capture.get_iv_keystream_pairs, key_length)

    return jsonify({'status': 'started', 'algorithm': algorithm})


@app.route('/api/stop_crack', methods=['POST'])
def stop_crack():
    try:
        data = request.json or {}
    except:
        data = {}
    algorithm = data.get('algorithm', 'all')

    if algorithm in ('fms', 'all'):
        fms_cracker.stop_cracking()
    if algorithm in ('ptw', 'all'):
        ptw_cracker.stop_cracking()

    return jsonify({'status': 'stopped'})


@app.route('/api/start_inject', methods=['POST'])
def start_inject():
    data = request.json
    interface = data.get('interface', 'wlan0')
    bssid = data.get('bssid', None)
    target_mac = data.get('target_mac', None)
    rate = data.get('rate', 10)

    arp_injector.start_injection(
        interface=interface,
        bssid=bssid,
        target_mac=target_mac,
        rate=rate,
        use_simulated=USE_SIMULATOR,
        callback=on_inject_sent if USE_SIMULATOR else None
    )

    if USE_SIMULATOR:
        if not wep_capture.is_capturing:
            wep_capture.start_capture(interface, bssid)

    return jsonify({'status': 'started', 'rate': rate})


@app.route('/api/stop_inject', methods=['POST'])
def stop_inject():
    arp_injector.stop_injection()
    return jsonify({'status': 'stopped'})


@app.route('/api/export_key', methods=['GET'])
def export_key():
    algorithm = request.args.get('algorithm', 'ptw')
    format_type = request.args.get('format', 'text')

    if algorithm == 'ptw' and ptw_cracker.cracked_key:
        key_bytes = ptw_cracker.cracked_key
    elif fms_cracker.cracked_key:
        key_bytes = fms_cracker.cracked_key
    else:
        return jsonify({'error': 'No key found'}), 404

    key_hex = key_bytes.hex()
    key_colon = ':'.join(f'{b:02X}' for b in key_bytes)
    key_ascii = key_bytes.decode('latin-1', errors='replace')

    if format_type == 'json':
        return jsonify({
            'key_hex': key_hex,
            'key_colon': key_colon,
            'key_bytes': list(key_bytes),
            'key_length': len(key_bytes) * 8,
            'algorithm': algorithm
        })
    elif format_type == 'download':
        content = f"""WEP Key Export
================
Algorithm: {algorithm.upper()}
Key Length: {len(key_bytes) * 8} bits

Hex (no spaces): {key_hex}
Hex (colon separated): {key_colon}
Byte values: {list(key_bytes)}
ASCII: {key_ascii}

Generated by WEP Cracker Tool
"""
        response = make_response(content)
        response.headers['Content-Type'] = 'text/plain'
        response.headers['Content-Disposition'] = f'attachment; filename="wep_key_{key_hex[:8]}.txt"'
        return response
    else:
        return jsonify({
            'key_hex': key_hex,
            'key_colon': key_colon,
            'key_bytes': list(key_bytes),
            'key_length': len(key_bytes) * 8
        })


@app.route('/api/reset', methods=['POST'])
def reset_all():
    wep_capture.stop_capture()
    fms_cracker.stop_cracking()
    ptw_cracker.stop_cracking()
    arp_injector.stop_injection()

    wep_capture.ivs = []
    wep_capture.weak_ivs = []
    wep_capture.iv_count = 0
    wep_capture.weak_iv_count = 0
    fms_cracker.key_found = False
    fms_cracker.cracked_key = None
    fms_cracker.progress = 0
    ptw_cracker.key_found = False
    ptw_cracker.cracked_key = None
    ptw_cracker.progress = 0
    arp_injector.stats = {'packets_sent': 0, 'last_sent_time': None}

    return jsonify({'status': 'reset'})


@app.route('/api/ivs')
def get_ivs():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    filter_type = request.args.get('filter', 'all')

    result = wep_capture.get_ivs_page(page, per_page, filter_type)

    items = []
    for item in result['items']:
        iv = item['iv']
        items.append({
            'iv': f'{iv[0]:02X}:{iv[1]:02X}:{iv[2]:02X}',
            'iv_dec': f'({iv[0]}, {iv[1]}, {iv[2]})',
            'keyid': item['keyid'],
            'is_weak': item['is_weak'],
            'encrypted_preview': ' '.join(f'{b:02X}' for b in item['encrypted'][:8]),
            'timestamp': round(item['timestamp'], 3)
        })

    return jsonify({
        'items': items,
        'total': result['total'],
        'page': result['page'],
        'per_page': result['per_page'],
        'total_pages': result['total_pages']
    })


@socketio.on('connect')
def handle_connect():
    capture_stats = wep_capture.get_stats()
    fms_status = fms_cracker.get_status()
    ptw_status = ptw_cracker.get_status()
    inject_stats = arp_injector.get_stats()
    emit('status_update', {
        'capture': capture_stats,
        'fms': fms_status,
        'ptw': ptw_status,
        'inject': {
            **inject_stats,
            'is_injecting': arp_injector.is_injecting
        }
    })


@socketio.on('request_status')
def handle_request_status():
    capture_stats = wep_capture.get_stats()
    fms_status = fms_cracker.get_status()
    ptw_status = ptw_cracker.get_status()
    inject_stats = arp_injector.get_stats()
    emit('status_update', {
        'capture': capture_stats,
        'fms': fms_status,
        'ptw': ptw_status,
        'inject': {
            **inject_stats,
            'is_injecting': arp_injector.is_injecting
        }
    })


def status_broadcast_thread():
    while True:
        capture_stats = wep_capture.get_stats()
        fms_status = fms_cracker.get_status()
        ptw_status = ptw_cracker.get_status()
        inject_stats = arp_injector.get_stats()
        socketio.emit('status_update', {
            'capture': capture_stats,
            'fms': fms_status,
            'ptw': ptw_status,
            'inject': {
                **inject_stats,
                'is_injecting': arp_injector.is_injecting
            }
        })
        time.sleep(1)


threading.Thread(target=status_broadcast_thread, daemon=True).start()


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=8080, debug=True)
