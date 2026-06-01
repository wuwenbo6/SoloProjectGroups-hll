#!/usr/bin/env python3
from flask import Flask, request, jsonify, send_from_directory, make_response
from flask_cors import CORS
from hiperlan2_parser import parse_hiperlan2_frame, create_test_frame, FrameType, analyze_retransmissions, frames_to_pcap_bytes
import os
import time

app = Flask(__name__)
CORS(app)

captured_frames = []


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/api/parse', methods=['POST'])
def parse_frame():
    try:
        data = request.get_json()
        hex_data = data.get('hex_data', '')
        
        if not hex_data:
            return jsonify({'error': 'No hex data provided'}), 400
        
        raw_bytes = bytes.fromhex(hex_data.replace(' ', '').replace(':', ''))
        parsed = parse_hiperlan2_frame(raw_bytes)
        
        return jsonify({
            'success': True,
            'data': parsed
        })
    
    except ValueError as e:
        return jsonify({'error': f'Invalid hex data: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/test-frames', methods=['GET'])
def get_test_frames():
    try:
        unicast_frame = create_test_frame(FrameType.UNICAST, seq_num=1)
        multicast_frame = create_test_frame(FrameType.MULTICAST, seq_num=2)
        broadcast_frame = create_test_frame(FrameType.BROADCAST, seq_num=3)
        retry_frame = create_test_frame(FrameType.UNICAST, seq_num=4, retry=True)
        
        return jsonify({
            'success': True,
            'frames': [
                {
                    'name': '单播帧 (Unicast)',
                    'type': 'unicast',
                    'hex': unicast_frame.hex(),
                    'sequence_number': 1
                },
                {
                    'name': '多播帧 (Multicast)',
                    'type': 'multicast',
                    'hex': multicast_frame.hex(),
                    'sequence_number': 2
                },
                {
                    'name': '广播帧 (Broadcast)',
                    'type': 'broadcast',
                    'hex': broadcast_frame.hex(),
                    'sequence_number': 3
                },
                {
                    'name': '重传帧 (Retry)',
                    'type': 'unicast',
                    'hex': retry_frame.hex(),
                    'sequence_number': 4,
                    'retry': True
                }
            ]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/capture', methods=['POST'])
def capture_frame():
    try:
        data = request.get_json()
        hex_data = data.get('hex_data', '')
        
        if not hex_data:
            return jsonify({'error': 'No hex data provided'}), 400
        
        raw_bytes = bytes.fromhex(hex_data.replace(' ', '').replace(':', ''))
        parsed = parse_hiperlan2_frame(raw_bytes)
        
        captured_frames.append({
            'id': len(captured_frames) + 1,
            'timestamp': int(__import__('time').time() * 1000),
            'hex_data': hex_data,
            'parsed': parsed
        })
        
        return jsonify({
            'success': True,
            'frame_id': len(captured_frames)
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/frames', methods=['GET'])
def get_frames():
    sorted_frames = sorted(captured_frames, key=lambda f: f['parsed'].get('sequence_number', 0))
    return jsonify({
        'success': True,
        'frames': sorted_frames
    })


@app.route('/api/frames/<int:frame_id>', methods=['GET'])
def get_frame(frame_id):
    for frame in captured_frames:
        if frame['id'] == frame_id:
            return jsonify({
                'success': True,
                'frame': frame
            })
    return jsonify({'error': 'Frame not found'}), 404


@app.route('/api/frames/clear', methods=['DELETE'])
def clear_frames():
    global captured_frames
    captured_frames = []
    return jsonify({'success': True, 'message': 'All frames cleared'})


@app.route('/api/retransmit-stats', methods=['GET'])
def get_retransmit_stats():
    try:
        sorted_frames = sorted(captured_frames, key=lambda f: f['parsed'].get('sequence_number', 0))
        stats = analyze_retransmissions(sorted_frames)
        return jsonify({
            'success': True,
            'stats': stats
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/export-pcap', methods=['GET'])
def export_pcap():
    try:
        sorted_frames = sorted(captured_frames, key=lambda f: f['parsed'].get('sequence_number', 0))
        pcap_data = frames_to_pcap_bytes(sorted_frames)
        
        response = make_response(pcap_data)
        response.headers['Content-Type'] = 'application/vnd.tcpdump.pcap'
        response.headers['Content-Disposition'] = 'attachment; filename="hiperlan2_capture.pcap"'
        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
