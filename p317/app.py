from flask import Flask, jsonify, request, send_from_directory, send_file, Response
from flask_cors import CORS
from ecpri_parser import EcpriParser
from pcapng_exporter import PcapngExporter
from aes_siv_cmac import (
    decrypt_cookie, build_cookie, encrypt_aes_siv_cmac,
    CookieDecryptError, FieldLengthError, AuthenticationError, InvalidKeyError,
    COOKIE_FIELDS, COOKIE_VERSION
)
import io
import json
import time
import threading
import random
import struct
import os
import base64
from collections import defaultdict

app = Flask(__name__)
CORS(app)

parser = EcpriParser()

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/parse', methods=['POST'])
def parse_frame():
    try:
        data = request.get_json()
        hex_data = data.get('hex_data', '')
        raw_bytes = bytes.fromhex(hex_data)
        frame = parser.parse(raw_bytes)
        return jsonify({
            'success': True,
            'frame': {
                'protocol_revision': frame.protocol_revision,
                'c_bit': frame.c_bit,
                'message_type': frame.message_type,
                'message_type_name': frame.message_type_name,
                'payload_size': frame.payload_size,
                'sequence_id': frame.sequence_id,
                'stream_id': frame.stream_id,
                'latency_ms': frame.latency_ms,
                'timestamp': frame.timestamp,
                'rtc_timestamp': frame.rtc_timestamp,
                'rtc_time_offset': frame.rtc_time_offset,
                'seq_status': frame.seq_status,
                'iq_sample_count': len(frame.iq_samples) if frame.iq_samples else 0,
                'iq_samples': [s.to_dict() for s in frame.iq_samples] if frame.iq_samples else []
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/streams')
def get_streams():
    streams = parser.get_all_streams()
    return jsonify({'success': True, 'streams': streams})

@app.route('/api/frames')
def get_frames():
    limit = request.args.get('limit', 100, type=int)
    frames = parser.get_recent_frames(limit)
    return jsonify({'success': True, 'frames': frames})

@app.route('/api/streams/<int:stream_id>/ordered')
def get_ordered_frames(stream_id):
    frames = parser.get_stream_ordered_frames(stream_id)
    return jsonify({'success': True, 'stream_id': stream_id, 'frames': frames})

@app.route('/api/iq-samples')
def get_iq_samples():
    stream_id = request.args.get('stream_id', None, type=int)
    limit = request.args.get('limit', 2000, type=int)
    samples = parser.get_iq_samples(stream_id=stream_id, limit=limit)
    return jsonify({'success': True, 'samples': samples})

@app.route('/api/export/pcapng')
def export_pcapng():
    try:
        frames = parser.get_raw_frames()
        exporter = PcapngExporter(frames=frames)
        pcap_data = exporter.export_to_bytes()
        
        filename = f"ecpri_capture_{int(time.time())}.pcapng"
        return Response(
            io.BytesIO(pcap_data),
            mimetype='application/vnd.tcpdump.pcapng',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/generate-test', methods=['POST'])
def generate_test_frames():
    data = request.get_json() or {}
    count = data.get('count', 10)
    stream_count = data.get('stream_count', 3)
    delay = data.get('delay', 0.1)
    
    def generate_frames():
        stream_seq = defaultdict(int)
        for i in range(count):
            stream_id = random.randint(1, stream_count)
            message_type = random.choice([0, 2])
            seq = stream_seq[stream_id]
            stream_seq[stream_id] = (seq + 1) % 65536

            if random.random() < 0.15 and seq > 1:
                seq = (seq - 2) % 65536
                stream_seq[stream_id] = (seq + 3) % 65536

            payload = struct.pack('!H', seq) + struct.pack('!H', stream_id)

            if message_type == 2:
                rtc_ts = int(time.time() * 1e6) & 0xFFFFFFFF
                rtc_off = random.randint(-500000, 500000)
                payload += struct.pack('!I', rtc_ts) + struct.pack('!i', rtc_off)
                for _ in range(8):
                    payload += bytes([random.randint(0, 255)])
            else:
                num_samples = 8
                t = i * 0.1
                freq_offset = stream_id * 0.5
                for s in range(num_samples):
                    phase = 2 * 3.1415926535 * (t + s * 0.01 + freq_offset)
                    i_sample = int(8000 * (1 if (s % 4 < 2) else -1) + random.gauss(0, 500))
                    q_sample = int(8000 * (1 if (s % 4 == 0 or s % 4 == 3) else -1) + random.gauss(0, 500))
                    i_sample = max(-32768, min(32767, i_sample))
                    q_sample = max(-32768, min(32767, q_sample))
                    payload += struct.pack('!h', i_sample) + struct.pack('!h', q_sample)

            header = bytes([0x10, message_type]) + len(payload).to_bytes(2, 'big')
            frame = header + payload
            parser.parse(frame)
            time.sleep(delay)
    
    thread = threading.Thread(target=generate_frames)
    thread.start()
    
    return jsonify({'success': True, 'message': f'Generating {count} test frames'})

@app.route('/api/cookie/decrypt', methods=['POST'])
def decrypt_cookie_api():
    try:
        data = request.get_json()
        key_hex = data.get('key', '')
        cookie_b64 = data.get('cookie_data', '')

        if not key_hex:
            return jsonify({'success': False, 'error': 'Missing key parameter'}), 400
        if not cookie_b64:
            return jsonify({'success': False, 'error': 'Missing cookie_data parameter'}), 400

        try:
            key = bytes.fromhex(key_hex)
        except ValueError:
            return jsonify({'success': False, 'error': 'Invalid key hex format'}), 400

        try:
            cookie_data = base64.b64decode(cookie_b64)
        except Exception:
            return jsonify({'success': False, 'error': 'Invalid base64 cookie data'}), 400

        result = decrypt_cookie(key, cookie_data)

        return jsonify({
            'success': True,
            'cookie': {
                'session_id': result.session_id,
                'user_id': result.user_id,
                'timestamp': result.timestamp,
                'flags': result.flags,
                'ttl': result.ttl
            }
        })

    except FieldLengthError as e:
        return jsonify({'success': False, 'error': f'Field length error: {str(e)}'}), 400
    except AuthenticationError as e:
        return jsonify({'success': False, 'error': f'Authentication error: {str(e)}'}), 403
    except InvalidKeyError as e:
        return jsonify({'success': False, 'error': f'Invalid key: {str(e)}'}), 400
    except CookieDecryptError as e:
        return jsonify({'success': False, 'error': f'Decrypt error: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cookie/encrypt', methods=['POST'])
def encrypt_cookie_api():
    try:
        data = request.get_json()
        key_hex = data.get('key', '')
        session_id = data.get('session_id', '')
        user_id = data.get('user_id', 0)
        timestamp = data.get('timestamp', int(time.time()))
        flags = data.get('flags', 0)
        ttl = data.get('ttl', 3600)

        if not key_hex:
            return jsonify({'success': False, 'error': 'Missing key parameter'}), 400

        try:
            key = bytes.fromhex(key_hex)
        except ValueError:
            return jsonify({'success': False, 'error': 'Invalid key hex format'}), 400

        session_id_bytes = bytes.fromhex(session_id) if session_id else os.urandom(16)
        if len(session_id_bytes) != 16:
            return jsonify({'success': False, 'error': 'session_id must be 16 bytes (32 hex chars)'}), 400

        plaintext = (
            session_id_bytes
            + struct.pack('!Q', user_id)
            + struct.pack('!Q', timestamp)
            + struct.pack('!I', flags)
            + struct.pack('!I', ttl)
        )

        nonce = os.urandom(16)
        cookie_data = build_cookie(key, nonce, plaintext)

        return jsonify({
            'success': True,
            'cookie_data': base64.b64encode(cookie_data).decode(),
            'nonce': nonce.hex(),
            'plaintext_size': len(plaintext)
        })

    except (FieldLengthError, InvalidKeyError) as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cookie/fields')
def cookie_fields_info():
    return jsonify({
        'success': True,
        'version': COOKIE_VERSION,
        'fields': {
            name: {
                'offset': info['offset'],
                'length': info['length'],
                'type': info['type']
            }
            for name, info in COOKIE_FIELDS.items()
        },
        'min_plaintext_size': 40,
        'valid_key_sizes': [32, 48, 64]
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
