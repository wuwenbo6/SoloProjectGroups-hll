from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
from werkzeug.utils import secure_filename

from .database import init_db, get_db
from .models import ProtocolTemplate, PcapFile, ParsedPacket, ProtocolField
from .analyzer import ProtocolAnalyzer

try:
    from .pcap_parser import PcapParser
    USE_PYSHARK = True
except ImportError:
    from .pcap_parser_fallback import FallbackPcapParser
    USE_PYSHARK = False

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
ALLOWED_EXTENSIONS = {'pcap', 'pcapng'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

init_db()


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')


@app.route('/api/templates', methods=['GET'])
def get_templates():
    db = next(get_db())
    templates = db.query(ProtocolTemplate).all()
    return jsonify([{
        'id': t.id,
        'name': t.name,
        'description': t.description,
        'created_at': t.created_at.isoformat() if t.created_at else None
    } for t in templates])


@app.route('/api/templates', methods=['POST'])
def create_template():
    data = request.json
    db = next(get_db())

    template = ProtocolTemplate(
        name=data['name'],
        description=data.get('description', ''),
        lua_script=data['lua_script']
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    if 'fields' in data:
        for field in data['fields']:
            pf = ProtocolField(
                template_id=template.id,
                name=field['name'],
                field_type=field['field_type'],
                offset=field.get('offset'),
                length=field.get('length'),
                description=field.get('description', '')
            )
            db.add(pf)
        db.commit()

    return jsonify({'id': template.id, 'name': template.name})


@app.route('/api/templates/<int:template_id>', methods=['GET'])
def get_template(template_id):
    db = next(get_db())
    template = db.query(ProtocolTemplate).get(template_id)
    if not template:
        return jsonify({'error': 'Template not found'}), 404

    fields = db.query(ProtocolField).filter_by(template_id=template_id).all()
    return jsonify({
        'id': template.id,
        'name': template.name,
        'description': template.description,
        'lua_script': template.lua_script,
        'fields': [{
            'id': f.id,
            'name': f.name,
            'field_type': f.field_type,
            'offset': f.offset,
            'length': f.length,
            'description': f.description
        } for f in fields]
    })


@app.route('/api/templates/<int:template_id>', methods=['DELETE'])
def delete_template(template_id):
    db = next(get_db())
    template = db.query(ProtocolTemplate).get(template_id)
    if not template:
        return jsonify({'error': 'Template not found'}), 404

    db.delete(template)
    db.commit()
    return jsonify({'success': True})


@app.route('/api/upload', methods=['POST'])
def upload_pcap():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)

        db = next(get_db())
        pcap_file = PcapFile(
            filename=filename,
            file_path=file_path
        )
        db.add(pcap_file)
        db.commit()
        db.refresh(pcap_file)

        return jsonify({
            'id': pcap_file.id,
            'filename': filename,
            'message': 'File uploaded successfully'
        })

    return jsonify({'error': 'Invalid file type'}), 400


@app.route('/api/parse/<int:pcap_id>', methods=['GET'])
def parse_pcap(pcap_id):
    db = next(get_db())
    pcap_file = db.query(PcapFile).get(pcap_id)
    if not pcap_file:
        return jsonify({'error': 'PCAP file not found'}), 404

    if USE_PYSHARK:
        parser = PcapParser()
    else:
        parser = FallbackPcapParser()
    try:
        packets = parser.parse_pcap(pcap_file.file_path)

        pcap_file.packet_count = len(packets)
        if packets:
            pcap_file.protocol = packets[0].get('protocol', '')
        db.commit()

        for pkt in packets:
            parsed = ParsedPacket(
                pcap_id=pcap_id,
                packet_number=pkt['packet_number'],
                timestamp=pkt['timestamp'],
                src_ip=pkt['src_ip'],
                dst_ip=pkt['dst_ip'],
                protocol=pkt['protocol'],
                length=pkt['length'],
                parsed_fields=json.dumps(pkt['layers'])
            )
            db.add(parsed)
        db.commit()

        return jsonify({
            'packet_count': len(packets),
            'packets': packets[:100]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/pcap/<int:pcap_id>/packets', methods=['GET'])
def get_packets(pcap_id):
    db = next(get_db())
    packets = db.query(ParsedPacket).filter_by(pcap_id=pcap_id).order_by(ParsedPacket.packet_number).all()

    return jsonify([{
        'id': p.id,
        'packet_number': p.packet_number,
        'timestamp': p.timestamp,
        'src_ip': p.src_ip,
        'dst_ip': p.dst_ip,
        'protocol': p.protocol,
        'length': p.length,
        'layers': json.loads(p.parsed_fields) if p.parsed_fields else []
    } for p in packets])


@app.route('/api/pcap/<int:pcap_id>/packet/<int:packet_num>', methods=['GET'])
def get_packet_detail(pcap_id, packet_num):
    db = next(get_db())
    packet = db.query(ParsedPacket).filter_by(
        pcap_id=pcap_id,
        packet_number=packet_num
    ).first()

    if not packet:
        return jsonify({'error': 'Packet not found'}), 404

    return jsonify({
        'id': packet.id,
        'packet_number': packet.packet_number,
        'timestamp': packet.timestamp,
        'src_ip': packet.src_ip,
        'dst_ip': packet.dst_ip,
        'protocol': packet.protocol,
        'length': packet.length,
        'layers': json.loads(packet.parsed_fields) if packet.parsed_fields else []
    })


@app.route('/api/pcaps', methods=['GET'])
def get_pcaps():
    db = next(get_db())
    pcaps = db.query(PcapFile).all()
    return jsonify([{
        'id': p.id,
        'filename': p.filename,
        'uploaded_at': p.uploaded_at.isoformat() if p.uploaded_at else None,
        'packet_count': p.packet_count,
        'protocol': p.protocol
    } for p in pcaps])


@app.route('/api/pcaps/<int:pcap_id>', methods=['DELETE'])
def delete_pcap(pcap_id):
    db = next(get_db())
    pcap = db.query(PcapFile).get(pcap_id)
    if not pcap:
        return jsonify({'error': 'PCAP not found'}), 404

    if os.path.exists(pcap.file_path):
        os.remove(pcap.file_path)

    db.delete(pcap)
    db.commit()
    return jsonify({'success': True})


@app.route('/api/init-template', methods=['POST'])
def init_default_template():
    db = next(get_db())

    existing = db.query(ProtocolTemplate).filter_by(name='Modbus Extension').first()
    if existing:
        return jsonify({'message': 'Template already exists'})

    lua_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'lua', 'modbus_ext_dissector.lua')
    with open(lua_path, 'r') as f:
        lua_script = f.read()

    template = ProtocolTemplate(
        name='Modbus Extension',
        description='Modbus protocol with custom industrial extensions for sensor data, configuration, firmware update, device status, and alarm management',
        lua_script=lua_script
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    fields = [
        {'name': 'Transaction Identifier', 'field_type': 'uint16', 'offset': 0, 'length': 2},
        {'name': 'Protocol Identifier', 'field_type': 'uint16', 'offset': 2, 'length': 2},
        {'name': 'Length', 'field_type': 'uint16', 'offset': 4, 'length': 2},
        {'name': 'Unit Identifier', 'field_type': 'uint8', 'offset': 6, 'length': 1},
        {'name': 'Function Code', 'field_type': 'uint8', 'offset': 7, 'length': 1},
        {'name': 'Sensor ID', 'field_type': 'uint16', 'offset': 8, 'length': 2},
        {'name': 'Sensor Type', 'field_type': 'uint8', 'offset': 10, 'length': 1},
        {'name': 'Timestamp', 'field_type': 'uint32', 'offset': 11, 'length': 4},
        {'name': 'Sensor Value', 'field_type': 'float', 'offset': 15, 'length': 4},
    ]

    for field in fields:
        pf = ProtocolField(
            template_id=template.id,
            name=field['name'],
            field_type=field['field_type'],
            offset=field['offset'],
            length=field['length'],
            description=''
        )
        db.add(pf)
    db.commit()

    return jsonify({'id': template.id, 'name': template.name})


@app.route('/api/analyze/<int:pcap_id>', methods=['GET'])
def analyze_pcap(pcap_id):
    db = next(get_db())
    packets_data = db.query(ParsedPacket).filter_by(pcap_id=pcap_id).order_by(ParsedPacket.packet_number).all()

    if not packets_data:
        return jsonify({'error': 'No parsed data found'}), 404

    packets = []
    for pkt in packets_data:
        packets.append({
            'packet_number': pkt.packet_number,
            'timestamp': pkt.timestamp,
            'src_ip': pkt.src_ip,
            'dst_ip': pkt.dst_ip,
            'protocol': pkt.protocol,
            'length': pkt.length,
            'layers': json.loads(pkt.parsed_fields) if pkt.parsed_fields else []
        })

    analyzer = ProtocolAnalyzer()
    analysis = analyzer.analyze_packets(packets)

    return jsonify(analysis)


@app.route('/api/export/<int:pcap_id>/<format>', methods=['GET'])
def export_report(pcap_id, format):
    if format not in ['json', 'html']:
        return jsonify({'error': 'Unsupported format. Use json or html'}), 400

    db = next(get_db())
    pcap_file = db.query(PcapFile).get(pcap_id)
    if not pcap_file:
        return jsonify({'error': 'PCAP not found'}), 404

    packets_data = db.query(ParsedPacket).filter_by(pcap_id=pcap_id).order_by(ParsedPacket.packet_number).all()
    packets = []
    for pkt in packets_data:
        packets.append({
            'packet_number': pkt.packet_number,
            'timestamp': pkt.timestamp,
            'src_ip': pkt.src_ip,
            'dst_ip': pkt.dst_ip,
            'protocol': pkt.protocol,
            'length': pkt.length,
            'layers': json.loads(pkt.parsed_fields) if pkt.parsed_fields else []
        })

    analyzer = ProtocolAnalyzer()
    analysis = analyzer.analyze_packets(packets)

    filename, mimetype, content = analyzer.export_report(analysis, format)

    response = app.response_class(
        response=content,
        mimetype=mimetype,
        headers={'Content-Disposition': f'attachment; filename="{pcap_file.filename}_{filename}"'}
    )
    return response


@app.route('/api/alerts', methods=['GET'])
def get_all_alerts():
    db = next(get_db())
    pcaps = db.query(PcapFile).all()

    all_alerts = []
    for pcap in pcaps:
        packets_data = db.query(ParsedPacket).filter_by(pcap_id=pcap.id).all()
        if packets_data:
            packets = [{
                'packet_number': pkt.packet_number,
                'timestamp': pkt.timestamp,
                'src_ip': pkt.src_ip,
                'dst_ip': pkt.dst_ip,
                'protocol': pkt.protocol,
                'layers': json.loads(pkt.parsed_fields) if pkt.parsed_fields else []
            } for pkt in packets_data]

            analyzer = ProtocolAnalyzer()
            analysis = analyzer.analyze_packets(packets)
            for alert in analysis.get('alerts', []):
                alert['pcap_id'] = pcap.id
                alert['pcap_filename'] = pcap.filename
                all_alerts.append(alert)

    return jsonify(all_alerts)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)
