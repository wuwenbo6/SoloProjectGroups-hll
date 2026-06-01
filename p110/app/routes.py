from flask import Blueprint, request, jsonify, send_file, render_template
from io import BytesIO
from app.models import db, ICDTemplate
from app.icd_parser import ICDParser, validate_icd
from app.cid_generator import CIDGenerator
from app.scd_merger import SCDMerger
from app.sv_config import SVConfigManager
from app.report_generator import ReportGenerator

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    return render_template('index.html')

@main_bp.route('/api/upload', methods=['POST'])
def upload_icd():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        xml_content = file.read().decode('utf-8')
        
        is_valid, message = validate_icd(xml_content)
        if not is_valid:
            return jsonify({'error': message}), 400
        
        parser = ICDParser(xml_content)
        parsed_data = parser.parse()
        
        return jsonify({
            'message': 'File parsed successfully',
            'filename': file.filename,
            'parsed_data': parsed_data,
            'xml_content': xml_content
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main_bp.route('/api/templates', methods=['GET'])
def get_templates():
    templates = ICDTemplate.query.all()
    return jsonify([t.to_dict() for t in templates])

@main_bp.route('/api/templates/<int:template_id>', methods=['GET'])
def get_template(template_id):
    template = ICDTemplate.query.get_or_404(template_id)
    parser = ICDParser(template.xml_content)
    parsed_data = parser.parse()
    return jsonify({
        'template': template.to_dict(),
        'parsed_data': parsed_data,
        'xml_content': template.xml_content
    })

@main_bp.route('/api/templates', methods=['POST'])
def save_template():
    data = request.json
    if not data or 'name' not in data or 'xml_content' not in data:
        return jsonify({'error': 'Missing required fields'}), 400
    
    template = ICDTemplate(
        name=data['name'],
        ied_name=data.get('ied_name'),
        manufacturer=data.get('manufacturer'),
        desc=data.get('desc'),
        xml_content=data['xml_content']
    )
    db.session.add(template)
    db.session.commit()
    
    return jsonify({'message': 'Template saved', 'template': template.to_dict()})

@main_bp.route('/api/templates/<int:template_id>', methods=['PUT'])
def update_template(template_id):
    template = ICDTemplate.query.get_or_404(template_id)
    data = request.json
    
    if 'name' in data:
        template.name = data['name']
    if 'ied_name' in data:
        template.ied_name = data['ied_name']
    if 'manufacturer' in data:
        template.manufacturer = data['manufacturer']
    if 'desc' in data:
        template.desc = data['desc']
    if 'xml_content' in data:
        template.xml_content = data['xml_content']
    
    db.session.commit()
    return jsonify({'message': 'Template updated', 'template': template.to_dict()})

@main_bp.route('/api/templates/<int:template_id>', methods=['DELETE'])
def delete_template(template_id):
    template = ICDTemplate.query.get_or_404(template_id)
    db.session.delete(template)
    db.session.commit()
    return jsonify({'message': 'Template deleted'})

@main_bp.route('/api/export/cid', methods=['POST'])
def export_cid():
    data = request.json
    if not data or 'xml_content' not in data:
        return jsonify({'error': 'Missing XML content'}), 400
    
    try:
        generator = CIDGenerator(data['xml_content'])
        
        if 'changes' in data:
            generator.apply_changes(data['changes'])
        
        fix_results = generator.fix_duplicate_goose_appid()
        
        cid_content = generator.to_string()
        filename = data.get('filename', 'exported.cid')
        
        return send_file(
            BytesIO(cid_content.encode('utf-8')),
            mimetype='application/xml',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main_bp.route('/api/goose/configs', methods=['POST'])
def get_goose_configs():
    data = request.json
    if not data or 'xml_content' not in data:
        return jsonify({'error': 'Missing XML content'}), 400
    
    try:
        generator = CIDGenerator(data['xml_content'])
        configs = generator.get_goose_configs()
        return jsonify({'goose_configs': configs})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main_bp.route('/api/parse', methods=['POST'])
def parse_xml():
    data = request.json
    if not data or 'xml_content' not in data:
        return jsonify({'error': 'Missing XML content'}), 400
    
    try:
        parser = ICDParser(data['xml_content'])
        parsed_data = parser.parse()
        return jsonify({'parsed_data': parsed_data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main_bp.route('/api/validate', methods=['POST'])
def validate():
    data = request.json
    if not data or 'xml_content' not in data:
        return jsonify({'error': 'Missing XML content'}), 400
    
    is_valid, message = validate_icd(data['xml_content'])
    return jsonify({'valid': is_valid, 'message': message})

@main_bp.route('/api/scd/merge', methods=['POST'])
def merge_scd():
    try:
        files = request.files.getlist('files')
        if len(files) < 2:
            return jsonify({'error': '需要至少2个ICD文件才能合并'}), 400
        
        merger = SCDMerger()
        ied_names = []
        
        for idx, file in enumerate(files):
            xml_content = file.read().decode('utf-8')
            custom_name = request.form.get(f'name_{idx}', '')
            merger.add_icd(xml_content, custom_name if custom_name else None)
        
        scd_name = request.form.get('scd_name', 'Merged_SCD')
        scd_content = merger.generate_scd(scd_name)
        
        return send_file(
            BytesIO(scd_content.encode('utf-8')),
            mimetype='application/xml',
            as_attachment=True,
            download_name=f'{scd_name}.scd'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main_bp.route('/api/sv/configs', methods=['POST'])
def get_sv_configs():
    data = request.json
    if not data or 'xml_content' not in data:
        return jsonify({'error': 'Missing XML content'}), 400
    
    try:
        sv_mgr = SVConfigManager(data['xml_content'])
        configs = sv_mgr.get_sv_configs()
        rate_options = sv_mgr.get_smp_rate_options()
        mod_options = sv_mgr.get_smp_mod_options()
        return jsonify({
            'sv_configs': configs,
            'rate_options': rate_options,
            'mod_options': mod_options
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main_bp.route('/api/sv/update', methods=['POST'])
def update_sv_config():
    data = request.json
    if not data or 'xml_content' not in data:
        return jsonify({'error': 'Missing XML content'}), 400
    
    try:
        sv_mgr = SVConfigManager(data['xml_content'])
        
        if 'svc_name' in data and 'smp_rate' in data:
            sv_mgr.update_sv_smp_rate(data['svc_name'], data['smp_rate'])
        
        if 'svc_name' in data and 'smp_mod' in data:
            sv_mgr.update_sv_smp_mod(data['svc_name'], data['smp_mod'])
        
        return jsonify({
            'message': 'SV配置已更新',
            'xml_content': sv_mgr.to_string()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main_bp.route('/api/report/html', methods=['POST'])
def generate_html_report():
    data = request.json
    if not data or 'xml_content' not in data:
        return jsonify({'error': 'Missing XML content'}), 400
    
    try:
        reporter = ReportGenerator(data['xml_content'])
        html_report = reporter.generate_html_report()
        return send_file(
            BytesIO(html_report.encode('utf-8')),
            mimetype='text/html',
            as_attachment=True,
            download_name='ied_report.html'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main_bp.route('/api/report/text', methods=['POST'])
def generate_text_report():
    data = request.json
    if not data or 'xml_content' not in data:
        return jsonify({'error': 'Missing XML content'}), 400
    
    try:
        reporter = ReportGenerator(data['xml_content'])
        text_report = reporter.generate_text_report()
        return send_file(
            BytesIO(text_report.encode('utf-8')),
            mimetype='text/plain',
            as_attachment=True,
            download_name='ied_report.txt'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500
