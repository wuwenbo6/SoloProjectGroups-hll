from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from enip_parser import (
    parse_enip_packet,
    build_read_tag_request,
    build_write_tag_request,
    decode_tag_data,
    CIPDataType,
    CIPServiceCode,
    build_explicit_message,
    send_explicit_message,
    create_default_tag_database,
    TagDatabase,
    TagDefinition
)
import socket
import struct
import time
from typing import Dict, Any

app = Flask(__name__)
CORS(app)

session_store: Dict[str, Dict[str, Any]] = {}
tag_database = create_default_tag_database()


class ENIPConnection:
    def __init__(self, host: str, port: int = 44818):
        self.host = host
        self.port = port
        self.socket = None
        self.session_handle = 0
        self.sender_context = b'\x00' * 8

    def connect(self):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.settimeout(5.0)
        self.socket.connect((self.host, self.port))
        self._register_session()

    def _register_session(self):
        command = 0x0065
        protocol_version = 1
        option_flags = 0
        
        data = struct.pack('<HH', protocol_version, option_flags)
        
        packet = struct.pack(
            '<HHII8sI',
            command,
            len(data),
            0,
            0,
            self.sender_context,
            0
        ) + data
        
        self.socket.send(packet)
        response = self.socket.recv(1024)
        
        if len(response) >= 24:
            self.session_handle = struct.unpack('<I', response[4:8])[0]

    def send_rr_data(self, cip_data: bytes) -> bytes:
        command = 0x006F
        
        address_item = struct.pack('<HH', 0x00, 0x00)
        data_item = struct.pack('<HH', 0xB1, len(cip_data)) + cip_data
        
        common_packet = struct.pack('<H', 2) + address_item + data_item
        
        interface_handle = 0
        timeout = 10
        
        encapsulation_data = struct.pack('<IH', interface_handle, timeout) + common_packet
        
        packet = struct.pack(
            '<HHII8sI',
            command,
            len(encapsulation_data),
            self.session_handle,
            0,
            self.sender_context,
            0
        ) + encapsulation_data
        
        self.socket.send(packet)
        response = self.socket.recv(4096)
        
        return response

    def disconnect(self):
        if self.socket:
            command = 0x0066
            packet = struct.pack(
                '<HHII8sI',
                command,
                0,
                self.session_handle,
                0,
                self.sender_context,
                0
            )
            self.socket.send(packet)
            self.socket.close()
            self.socket = None


@app.route('/api/parse', methods=['POST'])
def api_parse():
    try:
        data = request.json
        hex_data = data.get('hex_data', '')
        
        if not hex_data:
            return jsonify({'success': False, 'error': 'No hex data provided'}), 400
        
        raw_bytes = bytes.fromhex(hex_data)
        result = parse_enip_packet(raw_bytes)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/connect', methods=['POST'])
def api_connect():
    try:
        data = request.json
        host = data.get('host', '')
        port = data.get('port', 44818)
        session_id = data.get('session_id', f'session_{int(time.time())}')
        
        if not host:
            return jsonify({'success': False, 'error': 'No host provided'}), 400
        
        conn = ENIPConnection(host, port)
        conn.connect()
        
        session_store[session_id] = {
            'connection': conn,
            'host': host,
            'port': port,
            'connected_at': time.time()
        }
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'session_handle': f'0x{conn.session_handle:08X}'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/disconnect', methods=['POST'])
def api_disconnect():
    try:
        data = request.json
        session_id = data.get('session_id', '')
        
        if session_id in session_store:
            session_store[session_id]['connection'].disconnect()
            del session_store[session_id]
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/read-tag', methods=['POST'])
def api_read_tag():
    try:
        data = request.json
        session_id = data.get('session_id', '')
        tag_name = data.get('tag_name', '')
        data_type_str = data.get('data_type', 'DINT')
        
        if not session_id or session_id not in session_store:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        
        if not tag_name:
            return jsonify({'success': False, 'error': 'No tag name provided'}), 400
        
        data_type = getattr(CIPDataType, data_type_str, CIPDataType.DINT)
        
        conn = session_store[session_id]['connection']
        cip_request = build_read_tag_request(tag_name, data_type)
        response = conn.send_rr_data(cip_request)
        
        parsed = parse_enip_packet(response)
        
        if parsed['success'] and parsed['packet'].get('cip_message'):
            cip_data = parsed['packet']['cip_message']['data_hex']
            decoded_value = decode_tag_data(bytes.fromhex(cip_data), data_type)
            
            return jsonify({
                'success': True,
                'tag_name': tag_name,
                'value': decoded_value,
                'raw_response': parsed
            })
        
        return jsonify({
            'success': True,
            'tag_name': tag_name,
            'value': None,
            'raw_response': parsed
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/write-tag', methods=['POST'])
def api_write_tag():
    try:
        data = request.json
        session_id = data.get('session_id', '')
        tag_name = data.get('tag_name', '')
        value = data.get('value', 0)
        data_type_str = data.get('data_type', 'DINT')
        
        if not session_id or session_id not in session_store:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        
        if not tag_name:
            return jsonify({'success': False, 'error': 'No tag name provided'}), 400
        
        data_type = getattr(CIPDataType, data_type_str, CIPDataType.DINT)
        
        conn = session_store[session_id]['connection']
        cip_request = build_write_tag_request(tag_name, value, data_type)
        response = conn.send_rr_data(cip_request)
        
        parsed = parse_enip_packet(response)
        
        status = 'success'
        if parsed['success'] and parsed['packet'].get('cip_message'):
            if parsed['packet']['cip_message'].get('status', 0) == 0:
                status = 'success'
            else:
                status = f'error_{parsed["packet"]["cip_message"]["status"]}'
        
        return jsonify({
            'success': True,
            'tag_name': tag_name,
            'value_written': value,
            'status': status,
            'raw_response': parsed
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/generate-example', methods=['GET'])
def api_generate_example():
    examples = {
        'read_tag_request': '6f00360000000000000000000000000000000000000000000000000a00020000000000b10010004c0291085465737454616700000100',
        'read_tag_response': '6f001e0000000000000000000000000000000000000000000000000a00020000000000b1000800cc0000c40001002a000000',
        'write_tag_request': '6f003a0000000000000000000000000000000000000000000000000a00020000000000b10014004d029108546573745461670000c4000100ff000000',
        'register_session': '650004000000000000000000000000000000000001000000'
    }
    
    return jsonify({
        'success': True,
        'examples': examples
    })


@app.route('/api/data-types', methods=['GET'])
def api_data_types():
    types = {name: f'0x{value:02X}' for name, value in CIPDataType.__members__.items()}
    return jsonify({
        'success': True,
        'data_types': types
    })


@app.route('/api/send-explicit', methods=['POST'])
def api_send_explicit():
    try:
        data = request.json
        session_id = data.get('session_id', '')
        service_code = data.get('service_code', CIPServiceCode.GET_ATTRIBUTE_SINGLE)
        class_id = data.get('class_id', 0)
        instance_id = data.get('instance_id', 0)
        attribute_id = data.get('attribute_id', None)
        hex_data = data.get('data', '')
        
        if not session_id or session_id not in session_store:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        
        conn = session_store[session_id]['connection']
        
        extra_data = bytes.fromhex(hex_data) if hex_data else b''
        
        cip_data = build_explicit_message(
            service_code=service_code,
            class_id=class_id,
            instance_id=instance_id,
            attribute_id=attribute_id,
            data=extra_data
        )
        
        response, parsed = send_explicit_message(
            socket_obj=conn.socket,
            session_handle=conn.session_handle,
            sender_context=conn.sender_context,
            cip_data=cip_data
        )
        
        return jsonify({
            'success': True,
            'request_hex': cip_data.hex(),
            'response_hex': response.hex(),
            'parsed_response': parsed
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/tags', methods=['GET'])
def api_get_tags():
    try:
        tags = tag_database.to_dict()
        return jsonify({
            'success': True,
            'tags': tags,
            'count': len(tags)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/tags', methods=['POST'])
def api_add_tag():
    try:
        data = request.json
        tag = TagDefinition(
            name=data['name'],
            data_type=data['data_type'],
            data_type_name=data.get('data_type_name', ''),
            instance_id=data.get('instance_id', 0),
            array_dimensions=data.get('array_dimensions', []),
            description=data.get('description', ''),
            current_value=data.get('current_value', None),
            read_only=data.get('read_only', False)
        )
        tag_database.add_tag(tag)
        return jsonify({
            'success': True,
            'tag': tag.to_dict()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/tags/<tag_name>', methods=['DELETE'])
def api_delete_tag(tag_name):
    try:
        tag_database.remove_tag(tag_name)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/tags/export/json', methods=['GET'])
def api_export_tags_json():
    try:
        json_str = tag_database.export_json()
        response = make_response(json_str)
        response.headers['Content-Type'] = 'application/json'
        response.headers['Content-Disposition'] = 'attachment; filename=tag_database.json'
        return response
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/tags/export/csv', methods=['GET'])
def api_export_tags_csv():
    try:
        csv_str = tag_database.export_csv()
        response = make_response(csv_str)
        response.headers['Content-Type'] = 'text/csv; charset=utf-8'
        response.headers['Content-Disposition'] = 'attachment; filename=tag_database.csv'
        return response
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/tags/import/json', methods=['POST'])
def api_import_tags_json():
    try:
        data = request.json
        if 'tags' in data:
            tag_database.from_dict(data['tags'])
        else:
            tag_database.from_dict(data)
        return jsonify({
            'success': True,
            'count': len(tag_database.list_tags())
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/tags/reset', methods=['POST'])
def api_reset_tags():
    try:
        global tag_database
        tag_database = create_default_tag_database()
        return jsonify({
            'success': True,
            'count': len(tag_database.list_tags())
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/tags/read-all', methods=['POST'])
def api_read_all_tags():
    try:
        data = request.json
        session_id = data.get('session_id', '')
        
        if not session_id or session_id not in session_store:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        
        conn = session_store[session_id]['connection']
        results = []
        
        for tag_name in tag_database.list_tags():
            tag = tag_database.get_tag(tag_name)
            if tag and not tag.read_only:
                try:
                    cip_request = build_read_tag_request(tag_name, tag.data_type)
                    response = conn.send_rr_data(cip_request)
                    parsed = parse_enip_packet(response)
                    
                    if parsed['success'] and parsed['packet'].get('cip_message'):
                        cip_data = parsed['packet']['cip_message']['data_hex']
                        decoded_value = decode_tag_data(bytes.fromhex(cip_data), tag.data_type)
                        tag.current_value = decoded_value
                        results.append({
                            'name': tag_name,
                            'value': decoded_value,
                            'success': True
                        })
                    else:
                        results.append({
                            'name': tag_name,
                            'error': 'Parse failed',
                            'success': False
                        })
                except Exception as e:
                    results.append({
                        'name': tag_name,
                        'error': str(e),
                        'success': False
                    })
        
        return jsonify({
            'success': True,
            'results': results
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print("Starting EtherNet/IP Parser Server...")
    print("API Documentation:")
    print("  POST /api/parse              - Parse ENIP packet from hex data")
    print("  POST /api/connect            - Connect to PLC")
    print("  POST /api/disconnect         - Disconnect from PLC")
    print("  POST /api/read-tag           - Read a tag")
    print("  POST /api/write-tag          - Write a tag")
    print("  POST /api/send-explicit      - Send explicit message")
    print("  GET  /api/tags               - Get all tags")
    print("  POST /api/tags               - Add a tag")
    print("  DELETE /api/tags/<name>      - Delete a tag")
    print("  GET  /api/tags/export/json   - Export tags to JSON")
    print("  GET  /api/tags/export/csv    - Export tags to CSV")
    print("  POST /api/tags/import/json   - Import tags from JSON")
    print("  POST /api/tags/reset         - Reset to default tags")
    print("  POST /api/tags/read-all      - Read all tags from PLC")
    print("  GET  /api/generate-example   - Get example packets")
    print("  GET  /api/data-types         - Get supported CIP data types")
    app.run(host='0.0.0.0', port=5000, debug=True)
