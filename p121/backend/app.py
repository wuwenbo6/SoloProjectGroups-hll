import os
import json
from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
from werkzeug.utils import secure_filename

from models import db, IFModel, Element
from ifc_parser import parse_ifc_file
from geometry_processor import (
    merge_geometries_by_type,
    simplify_element,
    serialize_element,
)
from collision_detector import CollisionDetector
from bcf_exporter import create_bcf_report
from pipe_optimizer import optimize_pipe_routing
from sunlight_analyzer import analyze_sunlight, get_exposure_color

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
INSTANCE_DIR = os.path.join(BASE_DIR, 'instance')
DB_PATH = os.path.join(INSTANCE_DIR, 'ifc_models.db')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(INSTANCE_DIR, exist_ok=True)

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

ALLOWED_EXTENSIONS = {'ifc', 'ifczip'}

db.init_app(app)

with app.app_context():
    db.create_all()


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')


@app.route('/api/models', methods=['GET'])
def list_models():
    models = IFModel.query.order_by(IFModel.created_at.desc()).all()
    return jsonify([m.to_dict() for m in models])


@app.route('/api/models/<int:model_id>', methods=['GET'])
def get_model(model_id):
    model = IFModel.query.get_or_404(model_id)
    return jsonify(model.to_dict())


@app.route('/api/models/<int:model_id>/elements', methods=['GET'])
def get_model_elements(model_id):
    model = IFModel.query.get_or_404(model_id)
    elements = Element.query.filter_by(model_id=model_id).all()
    return jsonify([e.to_dict() for e in elements])


@app.route('/api/models/<int:model_id>/elements/<int:element_id>', methods=['GET'])
def get_element_detail(model_id, element_id):
    element = Element.query.filter_by(id=element_id, model_id=model_id).first()
    if not element:
        abort(404)
    return jsonify(element.to_detail_dict())


@app.route('/api/models/<int:model_id>/geometry', methods=['GET'])
def get_model_geometry(model_id):
    model = IFModel.query.get_or_404(model_id)
    elements = Element.query.filter_by(model_id=model_id).all()

    result = []
    for elem in elements:
        result.append({
            'id': elem.id,
            'ifc_id': elem.ifc_id,
            'ifc_type': elem.ifc_type,
            'name': elem.name,
            'vertices': json.loads(elem.vertices_json),
            'faces': json.loads(elem.faces_json),
            'colors': json.loads(elem.colors_json) if elem.colors_json else None,
            'aabb_min': elem.aabb_min,
            'aabb_max': elem.aabb_max,
            'merged': elem.merged,
        })

    return jsonify({'model_id': model_id, 'model_name': model.name, 'elements': result})


@app.route('/api/models', methods=['POST'])
def upload_model():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': f'File type not allowed. Allowed: {ALLOWED_EXTENSIONS}'}), 400

    filename = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(file_path)

    model_name = request.form.get('name', filename)
    quality = request.form.get('quality', 'high')
    quality = quality if quality in ['low', 'medium', 'high', 'ultra'] else 'high'

    model = IFModel(
        name=model_name,
        filename=filename,
        file_path=file_path,
        status='parsing',
    )
    db.session.add(model)
    db.session.commit()

    try:
        elements_raw, elem_count, total_v, total_f = parse_ifc_file(file_path, quality=quality)

        model.element_count = elem_count
        model.vertex_count = total_v
        model.face_count = total_f
        model.status = 'parsed'

        for elem_data in elements_raw:
            serialized = serialize_element(elem_data)
            element = Element(
                model_id=model.id,
                **serialized,
            )
            db.session.add(element)

        db.session.commit()
        return jsonify(model.to_dict())

    except Exception as e:
        model.status = 'error'
        db.session.commit()
        return jsonify({'error': str(e)}), 500


@app.route('/api/models/<int:model_id>/merge', methods=['POST'])
def merge_model(model_id):
    model = IFModel.query.get_or_404(model_id)

    Element.query.filter_by(model_id=model_id, merged=False).delete()

    raw_elements = []
    old_elements = Element.query.filter_by(model_id=model_id).all()
    for elem in old_elements:
        raw_elements.append({
            'ifc_id': elem.ifc_id,
            'ifc_type': elem.ifc_type,
            'name': elem.name,
            'vertices': json.loads(elem.vertices_json),
            'faces': json.loads(elem.faces_json),
            'colors': json.loads(elem.colors_json) if elem.colors_json else None,
            'aabb_min': elem.aabb_min,
            'aabb_max': elem.aabb_max,
        })

    Element.query.filter_by(model_id=model_id).delete()

    merged = merge_geometries_by_type(raw_elements)

    total_v = 0
    total_f = 0
    for elem_data in merged:
        serialized = serialize_element(elem_data)
        element = Element(
            model_id=model.id,
            **serialized,
        )
        db.session.add(element)
        total_v += len(elem_data['vertices']) // 3
        total_f += len(elem_data['faces']) // 3

    model.element_count = len(merged)
    model.vertex_count = total_v
    model.face_count = total_f
    model.status = 'merged'
    db.session.commit()

    return jsonify(model.to_dict())


@app.route('/api/models/<int:model_id>/simplify', methods=['POST'])
def simplify_model(model_id):
    model = IFModel.query.get_or_404(model_id)

    face_ratio = request.json.get('face_ratio', 0.5) if request.json else 0.5
    face_ratio = max(0.1, min(0.9, float(face_ratio)))

    elements = Element.query.filter_by(model_id=model_id).all()

    total_v = 0
    total_f = 0

    for element in elements:
        elem_data = {
            'vertices': json.loads(element.vertices_json),
            'faces': json.loads(element.faces_json),
            'colors': json.loads(element.colors_json) if element.colors_json else None,
        }
        simplified = simplify_element(elem_data, face_ratio)
        element.vertices_json = json.dumps(simplified['vertices'])
        element.faces_json = json.dumps(simplified['faces'])
        if simplified.get('colors'):
            element.colors_json = json.dumps(simplified['colors'])
        element.aabb_min = simplified['aabb_min']
        element.aabb_max = simplified['aabb_max']

        total_v += len(simplified['vertices']) // 3
        total_f += len(simplified['faces']) // 3

    model.vertex_count = total_v
    model.face_count = total_f
    model.status = 'simplified'
    db.session.commit()

    return jsonify(model.to_dict())


@app.route('/api/models/<int:model_id>', methods=['DELETE'])
def delete_model(model_id):
    model = IFModel.query.get_or_404(model_id)

    if model.file_path and os.path.exists(model.file_path):
        try:
            os.remove(model.file_path)
        except OSError:
            pass

    db.session.delete(model)
    db.session.commit()
    return jsonify({'message': 'Model deleted successfully'})


@app.route('/api/models/<int:model_id>/collisions', methods=['GET'])
def detect_collisions(model_id):
    mode = request.args.get('mode', 'precise')
    if mode not in ['aabb', 'obb', 'precise']:
        mode = 'precise'

    aabb_tolerance = float(request.args.get('aabb_tolerance', 0.001))
    obb_tolerance = float(request.args.get('obb_tolerance', 0.0))
    mesh_tolerance = float(request.args.get('mesh_tolerance', 1e-6))

    elements = Element.query.filter_by(model_id=model_id).all()

    if len(elements) < 2:
        return jsonify({
            'model_id': model_id,
            'mode': mode,
            'tolerances': {
                'aabb': aabb_tolerance,
                'obb': obb_tolerance,
                'mesh': mesh_tolerance,
            },
            'collision_count': 0,
            'collisions': [],
        })

    elem_dicts = []
    for elem in elements:
        elem_dicts.append({
            'id': elem.id,
            'ifc_id': elem.ifc_id,
            'ifc_type': elem.ifc_type,
            'name': elem.name,
            'aabb_min': elem.aabb_min,
            'aabb_max': elem.aabb_max,
            'vertices_json': elem.vertices_json,
            'faces_json': elem.faces_json,
        })

    detector = CollisionDetector(elem_dicts)
    results = detector.detect(
        mode=mode,
        aabb_tolerance=aabb_tolerance,
        obb_tolerance=obb_tolerance,
        mesh_tolerance=mesh_tolerance,
    )

    collisions = []
    for r in results:
        collisions.append({
            'element_a': {
                'id': r.element_a_id,
                'ifc_id': r.element_a_ifc_id,
                'ifc_type': r.element_a_type,
                'name': r.element_a_name,
            },
            'element_b': {
                'id': r.element_b_id,
                'ifc_id': r.element_b_ifc_id,
                'ifc_type': r.element_b_type,
                'name': r.element_b_name,
            },
            'level': r.level,
            'aabb_intersect': r.aabb_intersect,
            'obb_intersect': r.obb_intersect,
            'mesh_intersect': r.mesh_intersect,
            'intersection_count': r.intersection_count,
        })

    return jsonify({
        'model_id': model_id,
        'mode': mode,
        'tolerances': {
            'aabb': aabb_tolerance,
            'obb': obb_tolerance,
            'mesh': mesh_tolerance,
        },
        'collision_count': len(collisions),
        'collisions': collisions,
    })


@app.route('/api/models/<int:model_id>/collisions/bcf', methods=['GET'])
def export_bcf_report(model_id):
    model = IFModel.query.get_or_404(model_id)

    mode = request.args.get('mode', 'precise')
    aabb_tolerance = float(request.args.get('aabb_tolerance', 0.001))

    elements = Element.query.filter_by(model_id=model_id).all()

    if len(elements) < 2:
        return jsonify({'error': '模型构件数量不足，无法检测碰撞'}), 400

    elem_dicts = []
    for elem in elements:
        elem_dicts.append({
            'id': elem.id,
            'ifc_id': elem.ifc_id,
            'ifc_type': elem.ifc_type,
            'name': elem.name,
            'aabb_min': elem.aabb_min,
            'aabb_max': elem.aabb_max,
            'vertices_json': elem.vertices_json,
            'faces_json': elem.faces_json,
        })

    detector = CollisionDetector(elem_dicts)
    results = detector.detect(mode=mode, aabb_tolerance=aabb_tolerance)

    collisions = []
    for r in results:
        collisions.append({
            'element_a': {
                'id': r.element_a_id,
                'ifc_id': r.element_a_ifc_id,
                'ifc_type': r.element_a_type,
                'name': r.element_a_name,
            },
            'element_b': {
                'id': r.element_b_id,
                'ifc_id': r.element_b_ifc_id,
                'ifc_type': r.element_b_type,
                'name': r.element_b_name,
            },
            'level': r.level,
            'aabb_intersect': r.aabb_intersect,
            'obb_intersect': r.obb_intersect,
            'mesh_intersect': r.mesh_intersect,
            'intersection_count': r.intersection_count,
        })

    output_dir = os.path.join(INSTANCE_DIR, 'bcf_reports')
    os.makedirs(output_dir, exist_ok=True)

    try:
        bcf_path = create_bcf_report(
            model_name=model.name,
            collisions=collisions,
            elements=elem_dicts,
            author='IFC Viewer',
            output_dir=output_dir,
        )

        bcf_filename = os.path.basename(bcf_path)
        return jsonify({
            'model_id': model_id,
            'bcf_file': bcf_filename,
            'download_url': f'/api/models/{model_id}/bcf/download/{bcf_filename}',
            'collision_count': len(collisions),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/models/<int:model_id>/bcf/download/<filename>', methods=['GET'])
def download_bcf(model_id, filename):
    output_dir = os.path.join(INSTANCE_DIR, 'bcf_reports')
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(output_dir, safe_filename)

    if not os.path.exists(filepath):
        abort(404)

    return send_from_directory(output_dir, safe_filename, as_attachment=True)


@app.route('/api/models/<int:model_id>/optimize-pipes', methods=['POST'])
def optimize_pipes(model_id):
    model = IFModel.query.get_or_404(model_id)

    mode = request.args.get('mode', 'precise')
    aabb_tolerance = float(request.args.get('aabb_tolerance', 0.001))
    clearance = float(request.args.get('clearance', 0.1))

    elements = Element.query.filter_by(model_id=model_id).all()

    if len(elements) < 2:
        return jsonify({'error': '模型构件数量不足'}), 400

    elem_dicts = []
    for elem in elements:
        elem_dicts.append({
            'id': elem.id,
            'ifc_id': elem.ifc_id,
            'ifc_type': elem.ifc_type,
            'name': elem.name,
            'aabb_min': elem.aabb_min,
            'aabb_max': elem.aabb_max,
            'vertices_json': elem.vertices_json,
            'faces_json': elem.faces_json,
        })

    detector = CollisionDetector(elem_dicts)
    collision_results = detector.detect(mode=mode, aabb_tolerance=aabb_tolerance)

    collisions = []
    for r in collision_results:
        collisions.append({
            'element_a': {'id': r.element_a_id},
            'element_b': {'id': r.element_b_id},
        })

    updated_elements, solutions = optimize_pipe_routing(elem_dicts, collisions, clearance)

    total_v = 0
    total_f = 0
    for elem_data in updated_elements:
        elem = Element.query.filter_by(id=elem_data['id'], model_id=model_id).first()
        if elem:
            elem.vertices_json = elem_data['vertices_json']
            elem.faces_json = elem_data['faces_json']
            elem.aabb_min = elem_data['aabb_min']
            elem.aabb_max = elem_data['aabb_max']

            verts = json.loads(elem_data['vertices_json'])
            faces = json.loads(elem_data['faces_json'])
            total_v += len(verts) // 3
            total_f += len(faces) // 3

    model.vertex_count = total_v
    model.face_count = total_f
    model.status = 'optimized'
    db.session.commit()

    return jsonify({
        'model_id': model_id,
        'solutions': solutions,
        'optimized_count': len(solutions),
        'message': f'已优化 {len(solutions)} 处管线碰撞'
    })


@app.route('/api/models/<int:model_id>/sunlight', methods=['GET'])
def analyze_model_sunlight(model_id):
    model = IFModel.query.get_or_404(model_id)

    latitude = float(request.args.get('latitude', 31.23))
    longitude = float(request.args.get('longitude', 121.47))
    day_of_year = int(request.args.get('day', 172))
    start_hour = int(request.args.get('start_hour', 6))
    end_hour = int(request.args.get('end_hour', 18))
    hour_step = float(request.args.get('step', 1.0))

    elements = Element.query.filter_by(model_id=model_id).all()

    if len(elements) == 0:
        return jsonify({'error': '模型为空'}), 400

    elem_dicts = []
    for elem in elements:
        elem_dicts.append({
            'id': elem.id,
            'ifc_id': elem.ifc_id,
            'ifc_type': elem.ifc_type,
            'name': elem.name,
            'aabb_min': elem.aabb_min,
            'aabb_max': elem.aabb_max,
            'vertices_json': elem.vertices_json,
            'faces_json': elem.faces_json,
        })

    try:
        result = analyze_sunlight(
            elem_dicts,
            latitude=latitude,
            longitude=longitude,
            day_of_year=day_of_year,
            start_hour=start_hour,
            end_hour=end_hour,
            hour_step=hour_step,
        )

        for r in result['results']:
            r['color'] = get_exposure_color(r['exposure_level'])

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
