from flask import Flask, render_template, jsonify, request, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
import io

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///ladder_logic.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'dev-secret-key-change-in-production'

db = SQLAlchemy(app)
CORS(app)

from datetime import datetime

class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    blockly_xml = db.Column(db.Text, default='')
    st_code = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    conversion_history = db.relationship('ConversionHistory', backref='project', lazy=True, cascade='all, delete-orphan')

class ConversionHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=True)
    blockly_xml = db.Column(db.Text, nullable=False)
    st_code = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

from st_converter import BlocklyToSTConverter
from st_parser import STToBlocklyConverter, STParser
from plcopen_exporter import PLCopenExporter, FunctionBlockManager

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/projects', methods=['GET'])
def get_projects():
    projects = Project.query.order_by(Project.updated_at.desc()).all()
    return jsonify([{
        'id': p.id,
        'name': p.name,
        'description': p.description,
        'created_at': p.created_at.isoformat(),
        'updated_at': p.updated_at.isoformat()
    } for p in projects])

@app.route('/api/projects', methods=['POST'])
def create_project():
    data = request.json
    project = Project(
        name=data.get('name', 'Untitled Project'),
        description=data.get('description', ''),
        blockly_xml=data.get('blockly_xml', ''),
        st_code=data.get('st_code', '')
    )
    db.session.add(project)
    db.session.commit()
    return jsonify({'id': project.id, 'message': 'Project created successfully'})

@app.route('/api/projects/<int:project_id>', methods=['GET'])
def get_project(project_id):
    project = Project.query.get_or_404(project_id)
    return jsonify({
        'id': project.id,
        'name': project.name,
        'description': project.description,
        'blockly_xml': project.blockly_xml,
        'st_code': project.st_code,
        'created_at': project.created_at.isoformat(),
        'updated_at': project.updated_at.isoformat()
    })

@app.route('/api/projects/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    project = Project.query.get_or_404(project_id)
    data = request.json
    project.name = data.get('name', project.name)
    project.description = data.get('description', project.description)
    project.blockly_xml = data.get('blockly_xml', project.blockly_xml)
    project.st_code = data.get('st_code', project.st_code)
    project.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Project updated successfully'})

@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    db.session.delete(project)
    db.session.commit()
    return jsonify({'message': 'Project deleted successfully'})

@app.route('/api/convert', methods=['POST'])
def convert_to_st():
    data = request.json
    blockly_xml = data.get('blockly_xml', '')
    
    converter = BlocklyToSTConverter()
    st_code = converter.convert(blockly_xml)
    
    if data.get('save_history', False):
        project_id = data.get('project_id')
        history = ConversionHistory(
            project_id=project_id,
            blockly_xml=blockly_xml,
            st_code=st_code
        )
        db.session.add(history)
        db.session.commit()
    
    return jsonify({
        'st_code': st_code,
        'success': True
    })

@app.route('/api/download/st', methods=['POST'])
def download_st():
    data = request.json
    st_code = data.get('st_code', '')
    filename = data.get('filename', 'program.st')
    
    buffer = io.BytesIO()
    buffer.write(st_code.encode('utf-8'))
    buffer.seek(0)
    
    return send_file(
        buffer,
        as_attachment=True,
        download_name=filename,
        mimetype='text/plain'
    )

@app.route('/api/history', methods=['GET'])
def get_history():
    project_id = request.args.get('project_id', type=int)
    query = ConversionHistory.query
    if project_id:
        query = query.filter_by(project_id=project_id)
    history = query.order_by(ConversionHistory.created_at.desc()).limit(50).all()
    return jsonify([{
        'id': h.id,
        'project_id': h.project_id,
        'created_at': h.created_at.isoformat(),
        'st_code_preview': h.st_code[:100] + '...' if len(h.st_code) > 100 else h.st_code
    } for h in history])

@app.route('/api/convert/st-to-blockly', methods=['POST'])
def convert_st_to_blockly():
    data = request.json
    st_code = data.get('st_code', '')
    
    try:
        converter = STToBlocklyConverter()
        blockly_xml = converter.convert(st_code)
        
        return jsonify({
            'blockly_xml': blockly_xml,
            'success': True
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

@app.route('/api/parse/st', methods=['POST'])
def parse_st():
    data = request.json
    st_code = data.get('st_code', '')
    
    try:
        parser = STParser()
        ast = parser.parse(st_code)
        
        return jsonify({
            'ast': {
                'variables': [{'name': v.name, 'type': v.type} for v in ast['variables']],
                'timers': [{'name': t.name, 'type': t.type, 'in': t.in_var, 'pt': t.pt} for t in ast['timers']],
                'counters': [{'name': c.name, 'type': c.type, 'cu': c.cu, 'cd': c.cd, 'pv': c.pv} for c in ast['counters']],
                'function_blocks': [{'name': fb.name, 'type': fb.type} for fb in ast['function_blocks']],
                'rungs': [{'condition': r.condition, 'action': r.action} for r in ast['rungs']]
            },
            'success': True
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

@app.route('/api/export/plcopen', methods=['POST'])
def export_plcopen():
    data = request.json
    
    try:
        exporter = PLCopenExporter()
        xml_content = exporter.export_to_xml(data)
        
        buffer = io.BytesIO()
        buffer.write(xml_content.encode('utf-8'))
        buffer.seek(0)
        
        filename = data.get('name', 'project') + '.xml'
        
        return send_file(
            buffer,
            as_attachment=True,
            download_name=filename,
            mimetype='application/xml'
        )
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

@app.route('/api/function-blocks', methods=['GET'])
def get_function_blocks():
    fb_manager = FunctionBlockManager()
    fbs = fb_manager.list_function_blocks()
    
    result = []
    for fb_type in fbs:
        fb = fb_manager.get_function_block(fb_type)
        result.append(fb)
    
    return jsonify({'function_blocks': result})

@app.route('/api/function-blocks/<fb_type>', methods=['GET'])
def get_function_block(fb_type):
    fb_manager = FunctionBlockManager()
    fb = fb_manager.get_function_block(fb_type)
    
    if fb:
        return jsonify(fb)
    else:
        return jsonify({'error': 'Function block not found'}), 404

def create_tables():
    with app.app_context():
        db.create_all()

if __name__ == '__main__':
    create_tables()
    app.run(debug=True, port=5000)
