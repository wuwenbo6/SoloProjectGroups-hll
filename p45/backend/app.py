from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import json
import os
import uuid
from datetime import datetime
import pandas as pd
from io import BytesIO

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    from reportlab.lib.units import inch
    from reportlab.graphics.shapes import Drawing, Line
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(os.path.join(DATA_DIR, 'reports'), exist_ok=True)
os.makedirs(os.path.join(DATA_DIR, 'layouts'), exist_ok=True)

tag_scans = []
current_inventory = None
reports = []

@app.route('/')
def index():
    return jsonify({
        'status': 'running',
        'service': 'AGV RFID Inventory Backend',
        'version': '1.0.0'
    })

@app.route('/api/scan', methods=['POST'])
def record_scan():
    data = request.json
    scan_record = {
        'id': str(uuid.uuid4()),
        'tag_id': data.get('tag_id'),
        'position': data.get('position', {}),
        'timestamp': datetime.now().isoformat(),
        'distance': data.get('distance'),
        'metadata': data.get('metadata', {})
    }
    tag_scans.append(scan_record)
    
    socketio.emit('tag_scanned', scan_record)
    
    if current_inventory:
        current_inventory['scanned_tags'].add(scan_record['tag_id'])
        current_inventory['scan_records'].append(scan_record)
    
    return jsonify({'success': True, 'scan_id': scan_record['id']})

@app.route('/api/scans', methods=['GET'])
def get_scans():
    return jsonify({
        'count': len(tag_scans),
        'scans': tag_scans
    })

@app.route('/api/inventory/start', methods=['POST'])
def start_inventory():
    global current_inventory
    data = request.json or {}
    
    current_inventory = {
        'id': str(uuid.uuid4()),
        'start_time': datetime.now().isoformat(),
        'end_time': None,
        'name': data.get('name', f'Inventory_{datetime.now().strftime("%Y%m%d_%H%M%S")}'),
        'scanned_tags': set(),
        'scan_records': [],
        'expected_tags': data.get('expected_tags', [])
    }
    
    socketio.emit('inventory_started', {
        'id': current_inventory['id'],
        'start_time': current_inventory['start_time']
    })
    
    return jsonify({
        'success': True,
        'inventory_id': current_inventory['id'],
        'start_time': current_inventory['start_time']
    })

@app.route('/api/inventory/stop', methods=['POST'])
def stop_inventory():
    global current_inventory, reports
    
    if not current_inventory:
        return jsonify({'success': False, 'error': 'No active inventory'}), 400
    
    current_inventory['end_time'] = datetime.now().isoformat()
    
    scanned_list = list(current_inventory['scanned_tags'])
    expected_set = set(current_inventory['expected_tags'])
    scanned_set = current_inventory['scanned_tags']
    
    missing_tags = list(expected_set - scanned_set)
    extra_tags = list(scanned_set - expected_set)
    
    report = {
        'id': current_inventory['id'],
        'name': current_inventory['name'],
        'start_time': current_inventory['start_time'],
        'end_time': current_inventory['end_time'],
        'duration_seconds': (
            datetime.fromisoformat(current_inventory['end_time']) - 
            datetime.fromisoformat(current_inventory['start_time'])
        ).total_seconds(),
        'stats': {
            'total_expected': len(expected_set),
            'total_scanned': len(scanned_set),
            'missing': len(missing_tags),
            'extra': len(extra_tags),
            'accuracy': len(scanned_set & expected_set) / len(expected_set) * 100 if expected_set else 0
        },
        'scanned_tags': scanned_list,
        'missing_tags': missing_tags,
        'extra_tags': extra_tags,
        'scan_records': current_inventory['scan_records']
    }
    
    reports.append(report)
    
    report_file = os.path.join(DATA_DIR, 'reports', f"report_{report['id']}.json")
    with open(report_file, 'w') as f:
        json.dump(report, f, indent=2)
    
    socketio.emit('inventory_completed', report)
    
    inventory_id = current_inventory['id']
    current_inventory = None
    
    return jsonify({
        'success': True,
        'report_id': inventory_id,
        'report': report
    })

@app.route('/api/inventory/status', methods=['GET'])
def get_inventory_status():
    if current_inventory:
        return jsonify({
            'active': True,
            'id': current_inventory['id'],
            'name': current_inventory['name'],
            'start_time': current_inventory['start_time'],
            'scanned_count': len(current_inventory['scanned_tags'])
        })
    return jsonify({'active': False})

@app.route('/api/report', methods=['POST'])
def receive_report():
    data = request.json
    report_id = data.get('reportId') or str(uuid.uuid4())
    
    report = {
        'id': report_id,
        'start_time': data.get('startTime'),
        'end_time': data.get('endTime'),
        'duration': data.get('duration'),
        'stats': data.get('stats', {}),
        'scanned_tags': data.get('scannedTags', []),
        'missing_tags': data.get('missingTags', []),
        'scan_records': data.get('scanRecords', [])
    }
    
    reports.append(report)
    
    report_file = os.path.join(DATA_DIR, 'reports', f"report_{report_id}.json")
    with open(report_file, 'w') as f:
        json.dump(report, f, indent=2)
    
    return jsonify({
        'success': True,
        'report_id': report_id,
        'file': report_file
    })

@app.route('/api/reports', methods=['GET'])
def get_reports():
    return jsonify({
        'count': len(reports),
        'reports': [
            {
                'id': r['id'],
                'name': r.get('name', r['id']),
                'start_time': r.get('start_time'),
                'end_time': r.get('end_time'),
                'stats': r.get('stats', {})
            }
            for r in reports
        ]
    })

@app.route('/api/reports/<report_id>', methods=['GET'])
def get_report(report_id):
    report = next((r for r in reports if r['id'] == report_id), None)
    if not report:
        report_file = os.path.join(DATA_DIR, 'reports', f"report_{report_id}.json")
        if os.path.exists(report_file):
            with open(report_file, 'r') as f:
                report = json.load(f)
    
    if not report:
        return jsonify({'success': False, 'error': 'Report not found'}), 404
    
    return jsonify(report)

@app.route('/api/reports/<report_id>/export', methods=['GET'])
def export_report(report_id):
    format_type = request.args.get('format', 'xlsx')
    
    report = next((r for r in reports if r['id'] == report_id), None)
    if not report:
        report_file = os.path.join(DATA_DIR, 'reports', f"report_{report_id}.json")
        if os.path.exists(report_file):
            with open(report_file, 'r') as f:
                report = json.load(f)
    
    if not report:
        return jsonify({'success': False, 'error': 'Report not found'}), 404
    
    if format_type == 'xlsx':
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            summary_data = {
                'Metric': ['Total Tags', 'Scanned Tags', 'Missing Tags', 'Scan Rate (%)'],
                'Value': [
                    report['stats'].get('total', 0),
                    report['stats'].get('scanned', 0),
                    report['stats'].get('missing', 0),
                    report['stats'].get('scanRate', 0)
                ]
            }
            pd.DataFrame(summary_data).to_excel(writer, sheet_name='Summary', index=False)
            
            scanned_data = []
            for tag in report.get('scannedTags', []):
                scanned_data.append({
                    'Tag ID': tag.get('id'),
                    'Shelf ID': tag.get('metadata', {}).get('shelfId'),
                    'Level': tag.get('metadata', {}).get('level'),
                    'Position': tag.get('metadata', {}).get('position'),
                    'Scan Time': tag.get('scanTime'),
                    'Distance': tag.get('distance')
                })
            pd.DataFrame(scanned_data).to_excel(writer, sheet_name='Scanned Tags', index=False)
            
            missing_data = []
            for tag in report.get('missingTags', []):
                missing_data.append({
                    'Tag ID': tag.get('id'),
                    'Shelf ID': tag.get('metadata', {}).get('shelfId'),
                    'Level': tag.get('metadata', {}).get('level'),
                    'Position': tag.get('metadata', {}).get('position')
                })
            pd.DataFrame(missing_data).to_excel(writer, sheet_name='Missing Tags', index=False)
        
        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'report_{report_id}.xlsx'
        )
    
    elif format_type == 'csv':
        scanned_data = []
        for tag in report.get('scannedTags', []):
            scanned_data.append({
                'Tag ID': tag.get('id'),
                'Shelf ID': tag.get('metadata', {}).get('shelfId'),
                'Level': tag.get('metadata', {}).get('level'),
                'Position': tag.get('metadata', {}).get('position'),
                'Scan Time': tag.get('scanTime'),
                'Distance': tag.get('distance')
            })
        df = pd.DataFrame(scanned_data)
        output = BytesIO()
        df.to_csv(output, index=False)
        output.seek(0)
        return send_file(
            output,
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'report_{report_id}.csv'
        )
    
    elif format_type == 'pdf':
        if not PDF_AVAILABLE:
            return jsonify({'success': False, 'error': 'ReportLab not installed. Install with: pip install reportlab'}), 500
        
        return generate_pdf_report(report, report_id)
    
    return jsonify(report)


def generate_pdf_report(report, report_id):
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1a1a2e'),
        spaceAfter=20,
        alignment=1
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#2196F3'),
        spaceBefore=15,
        spaceAfter=10
    )
    
    normal_style = styles['Normal']
    
    story = []
    
    story.append(Paragraph('RFID Inventory Report', title_style))
    story.append(Spacer(1, 10))
    
    report_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    story.append(Paragraph(f'<b>Generated:</b> {report_date}', normal_style))
    story.append(Paragraph(f'<b>Report ID:</b> {report_id}', normal_style))
    story.append(Spacer(1, 20))
    
    story.append(Paragraph('Summary', heading_style))
    
    total_tags = report['stats'].get('total', 0)
    scanned_tags = report['stats'].get('scanned', 0)
    missing_tags = report['stats'].get('missing', 0)
    scan_rate = report['stats'].get('scanRate', 0)
    
    summary_data = [
        ['Metric', 'Value'],
        ['Total Tags', str(total_tags)],
        ['Scanned Tags', str(scanned_tags)],
        ['Missing Tags', str(missing_tags)],
        ['Scan Rate', f'{scan_rate}%']
    ]
    
    summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2196F3')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f5f5f5')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#dddddd')),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 20))
    
    scanned_list = report.get('scannedTags', [])
    story.append(Paragraph(f'Scanned Tags ({len(scanned_list)})', heading_style))
    
    if scanned_list:
        scanned_table_data = [['Tag ID', 'Shelf ID', 'Level', 'Position']]
        for tag in scanned_list[:30]:
            scanned_table_data.append([
                tag.get('id', '')[:15],
                tag.get('metadata', {}).get('shelfId', ''),
                str(tag.get('metadata', {}).get('level', '')),
                str(tag.get('metadata', {}).get('position', ''))
            ])
        
        scanned_table = Table(scanned_table_data, colWidths=[1.8*inch, 1.2*inch, 0.8*inch, 1.2*inch])
        scanned_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4CAF50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dddddd')),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
        ]))
        story.append(scanned_table)
        
        if len(scanned_list) > 30:
            story.append(Paragraph(f'... and {len(scanned_list) - 30} more tags', normal_style))
    else:
        story.append(Paragraph('No tags scanned', normal_style))
    
    story.append(Spacer(1, 20))
    
    missing_list = report.get('missingTags', [])
    story.append(Paragraph(f'Missing Tags ({len(missing_list)})', heading_style))
    
    if missing_list:
        missing_table_data = [['Tag ID', 'Shelf ID', 'Level', 'Position']]
        for tag in missing_list[:30]:
            missing_table_data.append([
                tag.get('id', '')[:15],
                tag.get('metadata', {}).get('shelfId', ''),
                str(tag.get('metadata', {}).get('level', '')),
                str(tag.get('metadata', {}).get('position', ''))
            ])
        
        missing_table = Table(missing_table_data, colWidths=[1.8*inch, 1.2*inch, 0.8*inch, 1.2*inch])
        missing_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f44336')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dddddd')),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
        ]))
        story.append(missing_table)
        
        if len(missing_list) > 30:
            story.append(Paragraph(f'... and {len(missing_list) - 30} more missing tags', normal_style))
    else:
        story.append(Paragraph('All tags accounted for - no missing tags!', normal_style))
    
    doc.build(story)
    output.seek(0)
    
    return send_file(
        output,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f'report_{report_id}.pdf'
    )

@app.route('/api/layout', methods=['POST'])
def save_layout():
    data = request.json
    layout_id = data.get('id') or str(uuid.uuid4())
    name = data.get('name', f'Layout_{datetime.now().strftime("%Y%m%d_%H%M%S")}')
    
    layout = {
        'id': layout_id,
        'name': name,
        'created': datetime.now().isoformat(),
        'shelves': data.get('shelves', [])
    }
    
    layout_file = os.path.join(DATA_DIR, 'layouts', f"layout_{layout_id}.json")
    with open(layout_file, 'w') as f:
        json.dump(layout, f, indent=2)
    
    return jsonify({
        'success': True,
        'layout_id': layout_id,
        'file': layout_file
    })

@app.route('/api/layouts', methods=['GET'])
def get_layouts():
    layouts = []
    layout_dir = os.path.join(DATA_DIR, 'layouts')
    for filename in os.listdir(layout_dir):
        if filename.endswith('.json'):
            with open(os.path.join(layout_dir, filename), 'r') as f:
                layouts.append(json.load(f))
    
    return jsonify({
        'count': len(layouts),
        'layouts': layouts
    })

@app.route('/api/layouts/<layout_id>', methods=['GET'])
def get_layout(layout_id):
    layout_file = os.path.join(DATA_DIR, 'layouts', f"layout_{layout_id}.json")
    if not os.path.exists(layout_file):
        return jsonify({'success': False, 'error': 'Layout not found'}), 404
    
    with open(layout_file, 'r') as f:
        return jsonify(json.load(f))

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('connected', {'status': 'connected'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('agv_position')
def handle_agv_position(data):
    emit('agv_position_update', data, broadcast=True)

@socketio.on('cmd_vel')
def handle_cmd_vel(data):
    emit('cmd_vel', data, broadcast=True)

@socketio.on('rfid_scan')
def handle_rfid_scan(data):
    scan_record = {
        'id': str(uuid.uuid4()),
        'tag_id': data.get('tag_id'),
        'position': data.get('position', {}),
        'timestamp': datetime.now().isoformat(),
        'distance': data.get('distance')
    }
    tag_scans.append(scan_record)
    emit('tag_scanned', scan_record, broadcast=True)

if __name__ == '__main__':
    print('Starting AGV RFID Inventory Backend...')
    print(f'Data directory: {DATA_DIR}')
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
