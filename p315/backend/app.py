from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from q931_decoder import decode_q931_message, message_to_dict
from cdr_generator import generate_cdr, cdr_to_json, cdr_to_csv, cdr_to_text, cdr_to_dict, generate_cdr_summary
import os

app = Flask(__name__, static_folder='../frontend', static_url_path='/')
CORS(app)

SAMPLE_CALL_FLOWS = [
    {
        'id': 'call_001',
        'name': '正常语音呼叫建立与释放',
        'calling_party': '13800138000',
        'called_party': '13900139000',
        'start_time': '2024-01-15 10:30:00',
        'messages': [
            {
                'timestamp': '10:30:00.125',
                'direction': 'UE -> Network',
                'hex_data': '08 02 10 01 05 04 03 80 90 A2 40 07 81 31 09 10 93 00 F0'
            },
            {
                'timestamp': '10:30:00.250',
                'direction': 'Network -> UE',
                'hex_data': '08 02 90 01 02'
            },
            {
                'timestamp': '10:30:00.380',
                'direction': 'Network -> UE',
                'hex_data': '08 02 90 01 01'
            },
            {
                'timestamp': '10:30:02.150',
                'direction': 'Network -> UE',
                'hex_data': '08 02 90 01 07 04 03 80 90 A2'
            },
            {
                'timestamp': '10:30:02.200',
                'direction': 'UE -> Network',
                'hex_data': '08 02 10 01 0F'
            },
            {
                'timestamp': '10:30:15.680',
                'direction': 'UE -> Network',
                'hex_data': '08 02 10 01 45 08 02 81 90'
            },
            {
                'timestamp': '10:30:15.720',
                'direction': 'Network -> UE',
                'hex_data': '08 02 90 01 46 08 02 82 90'
            },
            {
                'timestamp': '10:30:15.750',
                'direction': 'UE -> Network',
                'hex_data': '08 02 10 01 5A 08 02 81 90'
            }
        ]
    },
    {
        'id': 'call_002',
        'name': '被叫用户忙呼叫释放',
        'calling_party': '13700137000',
        'called_party': '13600136000',
        'start_time': '2024-01-15 11:45:00',
        'messages': [
            {
                'timestamp': '11:45:00.500',
                'direction': 'UE -> Network',
                'hex_data': '08 02 10 02 05 04 03 80 90 A2 40 07 81 31 06 10 63 00 F0'
            },
            {
                'timestamp': '11:45:00.620',
                'direction': 'Network -> UE',
                'hex_data': '08 02 90 02 02'
            },
            {
                'timestamp': '11:45:00.850',
                'direction': 'Network -> UE',
                'hex_data': '08 02 90 02 45 08 02 82 91'
            },
            {
                'timestamp': '11:45:00.900',
                'direction': 'UE -> Network',
                'hex_data': '08 02 10 02 46 08 02 81 90'
            }
        ]
    },
    {
        'id': 'call_003',
        'name': '无应答呼叫释放',
        'calling_party': '13500135000',
        'called_party': '13400134000',
        'start_time': '2024-01-15 14:20:00',
        'messages': [
            {
                'timestamp': '14:20:00.300',
                'direction': 'UE -> Network',
                'hex_data': '08 02 10 03 05 04 03 80 90 A2 40 07 81 31 04 10 43 00 F0'
            },
            {
                'timestamp': '14:20:00.450',
                'direction': 'Network -> UE',
                'hex_data': '08 02 90 03 02'
            },
            {
                'timestamp': '14:20:00.600',
                'direction': 'Network -> UE',
                'hex_data': '08 02 90 03 01'
            },
            {
                'timestamp': '14:20:18.900',
                'direction': 'Network -> UE',
                'hex_data': '08 02 90 03 45 08 02 82 93'
            },
            {
                'timestamp': '14:20:18.950',
                'direction': 'UE -> Network',
                'hex_data': '08 02 10 03 46 08 02 81 90'
            }
        ]
    }
]


@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')


@app.route('/api/decode', methods=['POST'])
def decode_message():
    try:
        data = request.get_json()
        if not data or 'hex_data' not in data:
            return jsonify({'error': 'Missing hex_data parameter'}), 400
        
        hex_data = data['hex_data']
        message = decode_q931_message(hex_data)
        result = message_to_dict(message)
        
        return jsonify({
            'success': True,
            'message': result
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.route('/api/decode-batch', methods=['POST'])
def decode_batch():
    try:
        data = request.get_json()
        if not data or 'messages' not in data:
            return jsonify({'error': 'Missing messages parameter'}), 400
        
        results = []
        for msg_data in data['messages']:
            try:
                message = decode_q931_message(msg_data['hex_data'])
                decoded = message_to_dict(message)
                results.append({
                    'success': True,
                    'timestamp': msg_data.get('timestamp'),
                    'direction': msg_data.get('direction'),
                    'message': decoded
                })
            except Exception as e:
                results.append({
                    'success': False,
                    'timestamp': msg_data.get('timestamp'),
                    'direction': msg_data.get('direction'),
                    'error': str(e),
                    'raw_hex': msg_data['hex_data']
                })
        
        return jsonify({
            'success': True,
            'results': results
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.route('/api/call-flows', methods=['GET'])
def get_call_flows():
    return jsonify({
        'success': True,
        'call_flows': SAMPLE_CALL_FLOWS
    })


@app.route('/api/call-flows/<flow_id>', methods=['GET'])
def get_call_flow(flow_id):
    for flow in SAMPLE_CALL_FLOWS:
        if flow['id'] == flow_id:
            return jsonify({
                'success': True,
                'call_flow': flow
            })
    return jsonify({
        'success': False,
        'error': 'Call flow not found'
    }), 404


@app.route('/api/message-types', methods=['GET'])
def get_message_types():
    from q931_decoder import MESSAGE_TYPES, IE_TYPES, CAUSE_VALUES
    return jsonify({
        'success': True,
        'message_types': {f'0x{k:02X}': v for k, v in MESSAGE_TYPES.items()},
        'ie_types': {f'0x{k:02X}': v for k, v in IE_TYPES.items()},
        'cause_values': {f'0x{k:02X}': v for k, v in CAUSE_VALUES.items()}
    })


@app.route('/api/cdr/<flow_id>', methods=['GET'])
def get_cdr(flow_id):
    try:
        flow = None
        for f in SAMPLE_CALL_FLOWS:
            if f['id'] == flow_id:
                flow = f
                break
        
        if not flow:
            return jsonify({
                'success': False,
                'error': 'Call flow not found'
            }), 404
        
        cdr = generate_cdr(flow)
        summary = generate_cdr_summary(cdr)
        
        return jsonify({
            'success': True,
            'cdr': cdr_to_dict(cdr),
            'summary': summary
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/cdr/<flow_id>/export', methods=['GET'])
def export_cdr(flow_id):
    try:
        format_type = request.args.get('format', 'json').lower()
        
        flow = None
        for f in SAMPLE_CALL_FLOWS:
            if f['id'] == flow_id:
                flow = f
                break
        
        if not flow:
            return jsonify({
                'success': False,
                'error': 'Call flow not found'
            }), 404
        
        cdr = generate_cdr(flow)
        filename = f"CDR_{flow_id}_{cdr.cdr_id.split('-')[-1]}"
        
        if format_type == 'csv':
            content = cdr_to_csv(cdr)
            mimetype = 'text/csv'
            filename += '.csv'
        elif format_type == 'text' or format_type == 'txt':
            content = cdr_to_text(cdr)
            mimetype = 'text/plain'
            filename += '.txt'
        else:
            content = cdr_to_json(cdr, pretty=True)
            mimetype = 'application/json'
            filename += '.json'
        
        return Response(
            content,
            mimetype=mimetype,
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/cdr/<flow_id>/summary', methods=['GET'])
def get_cdr_summary(flow_id):
    try:
        flow = None
        for f in SAMPLE_CALL_FLOWS:
            if f['id'] == flow_id:
                flow = f
                break
        
        if not flow:
            return jsonify({
                'success': False,
                'error': 'Call flow not found'
            }), 404
        
        cdr = generate_cdr(flow)
        summary = generate_cdr_summary(cdr)
        
        return jsonify({
            'success': True,
            'summary': summary
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/cdr/generate', methods=['POST'])
def generate_cdr_from_data():
    try:
        data = request.get_json()
        if not data or 'call_flow' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing call_flow parameter'
            }), 400
        
        call_flow_data = data['call_flow']
        format_type = data.get('format', 'dict')
        
        cdr = generate_cdr(call_flow_data)
        
        if format_type == 'json':
            return jsonify({
                'success': True,
                'cdr': cdr_to_dict(cdr),
                'cdr_json': cdr_to_json(cdr),
                'cdr_csv': cdr_to_csv(cdr),
                'cdr_text': cdr_to_text(cdr),
                'summary': generate_cdr_summary(cdr)
            })
        else:
            return jsonify({
                'success': True,
                'cdr': cdr_to_dict(cdr),
                'summary': generate_cdr_summary(cdr)
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
