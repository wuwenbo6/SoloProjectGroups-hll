from flask import Blueprint, request, jsonify, render_template, send_file
import os
from datetime import datetime
import numpy as np
from scipy.spatial import cKDTree
from app.simulator import SWMMSimulator, SWMMParameterEditor
from app.lid_manager import LIDManager
from app.calibration import SCEUACalibrator
from app.animation_export import AnimationExporter
from app.models import Simulation, NetworkNode, NetworkLink, Subcatchment, CalibrationRun, LIDScenario
from app import db

main_bp = Blueprint('main', __name__)

INP_FILE = os.path.join(os.path.dirname(__file__), '../../data/swmm/example_network.inp')

@main_bp.route('/')
def index():
    return render_template('index.html')

@main_bp.route('/api/simulate', methods=['POST'])
def run_simulation():
    try:
        data = request.get_json()
        sim_name = data.get('name', 'Simulation')
        
        if not os.path.exists(INP_FILE):
            return jsonify({'success': False, 'error': 'SWMM input file not found'}), 404
        
        simulator = SWMMSimulator(INP_FILE)
        result = simulator.run_simulation(sim_name)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@main_bp.route('/api/simulations', methods=['GET'])
def get_simulations():
    simulations = Simulation.query.order_by(Simulation.created_at.desc()).all()
    return jsonify([{
        'id': s.id,
        'name': s.name,
        'status': s.status,
        'created_at': s.created_at.isoformat(),
        'duration': s.duration
    } for s in simulations])

@main_bp.route('/api/simulations/<int:sim_id>/nodes', methods=['GET'])
def get_node_results(sim_id):
    node_id = request.args.get('node_id')
    simulator = SWMMSimulator(INP_FILE)
    results = simulator.get_node_results(sim_id, node_id)
    return jsonify(results)

@main_bp.route('/api/simulations/<int:sim_id>/links', methods=['GET'])
def get_link_results(sim_id):
    link_id = request.args.get('link_id')
    simulator = SWMMSimulator(INP_FILE)
    results = simulator.get_link_results(sim_id, link_id)
    return jsonify(results)

@main_bp.route('/api/network', methods=['GET'])
def get_network():
    simulator = SWMMSimulator(INP_FILE)
    geojson = simulator.get_network_geojson()
    return jsonify(geojson)

@main_bp.route('/api/nodes', methods=['GET'])
def get_nodes():
    nodes = NetworkNode.query.all()
    return jsonify([{
        'id': n.node_id,
        'type': n.node_type,
        'x': n.x_coord,
        'y': n.y_coord,
        'invert_elev': n.invert_elev,
        'max_depth': n.max_depth
    } for n in nodes])

@main_bp.route('/api/links', methods=['GET'])
def get_links():
    links = NetworkLink.query.all()
    return jsonify([{
        'id': l.link_id,
        'type': l.link_type,
        'from_node': l.from_node,
        'to_node': l.to_node,
        'length': l.length,
        'roughness': l.roughness
    } for l in links])

@main_bp.route('/api/subcatchments', methods=['GET'])
def get_subcatchments():
    subs = Subcatchment.query.all()
    return jsonify([{
        'id': s.subcatchment_id,
        'outlet': s.outlet,
        'area': s.area,
        'width': s.width,
        'slope': s.slope,
        'perc_imperv': s.perc_imperv,
        'n_imperv': s.n_imperv,
        'n_perv': s.n_perv
    } for s in subs])

@main_bp.route('/api/parameters/subcatchment/area', methods=['POST'])
def modify_subcatchment_area():
    try:
        data = request.get_json()
        subcatchment_id = data.get('subcatchment_id')
        new_area = data.get('area')
        
        if not subcatchment_id or new_area is None:
            return jsonify({'success': False, 'error': 'Missing parameters'}), 400
        
        editor = SWMMParameterEditor(INP_FILE)
        result = editor.modify_subcatchment_area(subcatchment_id, new_area)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@main_bp.route('/api/parameters/link/roughness', methods=['POST'])
def modify_roughness():
    try:
        data = request.get_json()
        link_id = data.get('link_id')
        new_roughness = data.get('roughness')
        
        if not link_id or new_roughness is None:
            return jsonify({'success': False, 'error': 'Missing parameters'}), 400
        
        editor = SWMMParameterEditor(INP_FILE)
        result = editor.modify_roughness(link_id, new_roughness)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@main_bp.route('/api/simulations/<int:sim_id>/heatmap', methods=['GET'])
def get_heatmap_data(sim_id):
    timestamp = request.args.get('timestamp')
    
    from app.models import NodeResult
    from datetime import datetime
    
    query = NodeResult.query.filter_by(simulation_id=sim_id)
    if timestamp:
        try:
            ts = datetime.fromisoformat(timestamp)
            query = query.filter(NodeResult.timestamp >= ts)
        except:
            pass
    
    results = query.order_by(NodeResult.timestamp).all()
    
    heatmap_data = {}
    for r in results:
        node = NetworkNode.query.filter_by(node_id=r.node_id).first()
        if node:
            if r.timestamp.isoformat() not in heatmap_data:
                heatmap_data[r.timestamp.isoformat()] = []
            heatmap_data[r.timestamp.isoformat()].append({
                'lat': node.y_coord,
                'lng': node.x_coord,
                'depth': r.depth,
                'flooding': r.flooding,
                'intensity': min(r.depth / max(node.max_depth, 0.1), 1.0)
            })
    
    return jsonify(heatmap_data)

@main_bp.route('/api/simulations/<int:sim_id>/flooding', methods=['GET'])
def get_flooding_data(sim_id):
    from app.models import NodeResult
    
    results = NodeResult.query.filter(
        NodeResult.simulation_id == sim_id,
        NodeResult.flooding > 0
    ).all()
    
    flooding_by_node = {}
    for r in results:
        if r.node_id not in flooding_by_node:
            node = NetworkNode.query.filter_by(node_id=r.node_id).first()
            flooding_by_node[r.node_id] = {
                'node_id': r.node_id,
                'x': node.x_coord if node else 0,
                'y': node.y_coord if node else 0,
                'max_flooding': 0,
                'total_flooding': 0,
                'timestamps': []
            }
        flooding_by_node[r.node_id]['max_flooding'] = max(
            flooding_by_node[r.node_id]['max_flooding'],
            r.flooding
        )
        flooding_by_node[r.node_id]['total_flooding'] += r.flooding
        flooding_by_node[r.node_id]['timestamps'].append({
            'time': r.timestamp.isoformat(),
            'flooding': r.flooding
        })
    
    return jsonify(list(flooding_by_node.values()))

@main_bp.route('/api/simulations/<int:sim_id>/inundation', methods=['GET'])
def get_inundation_contours(sim_id):
    from app.models import NodeResult
    from datetime import datetime
    
    timestamp = request.args.get('timestamp')
    levels_str = request.args.get('levels', '0.1,0.5,1.0,2.0')
    resolution = int(request.args.get('resolution', '50'))
    
    levels = [float(x) for x in levels_str.split(',')]
    
    nodes = NetworkNode.query.all()
    if not nodes:
        return jsonify({'error': 'No network nodes found'}), 404
    
    node_coords = np.array([[n.x_coord, n.y_coord] for n in nodes])
    node_ids = [n.node_id for n in nodes]
    
    query = NodeResult.query.filter_by(simulation_id=sim_id)
    if timestamp:
        try:
            ts = datetime.fromisoformat(timestamp)
            query = query.filter(NodeResult.timestamp == ts)
        except:
            pass
    
    results = query.all()
    if not results:
        return jsonify({'contours': [], 'timestamp': None})
    
    result_by_node = {r.node_id: r.depth for r in results}
    depths = np.array([result_by_node.get(nid, 0) for nid in node_ids])
    
    min_x, min_y = node_coords.min(axis=0) - 0.002
    max_x, max_y = node_coords.max(axis=0) + 0.002
    
    x_grid = np.linspace(min_x, max_x, resolution)
    y_grid = np.linspace(min_y, max_y, resolution)
    X, Y = np.meshgrid(x_grid, y_grid)
    grid_points = np.column_stack([X.ravel(), Y.ravel()])
    
    tree = cKDTree(node_coords)
    distances, indices = tree.query(grid_points, k=min(3, len(node_coords)))
    
    power = 2
    weights = 1.0 / (np.maximum(distances, 1e-8) ** power)
    weights = weights / weights.sum(axis=1, keepdims=True)
    
    interpolated = (weights * depths[indices]).sum(axis=1)
    interpolated = interpolated.reshape(X.shape)
    
    contours = []
    for level in levels:
        polygon_points = _marching_squares(X, Y, interpolated, level)
        if polygon_points:
            contours.append({
                'level': level,
                'polygons': polygon_points,
                'color': _get_depth_color(level)
            })
    
    return jsonify({
        'contours': contours,
        'timestamp': timestamp,
        'grid_bounds': {
            'min_x': float(min_x),
            'max_x': float(max_x),
            'min_y': float(min_y),
            'max_y': float(max_y)
        }
    })

def _marching_squares(X, Y, Z, level):
    from skimage import measure
    
    try:
        contours = measure.find_contours(Z, level)
    except ImportError:
        return _simple_contour(X, Y, Z, level)
    
    result = []
    for contour in contours:
        i_coords = contour[:, 0]
        j_coords = contour[:, 1]
        
        x_coords = X[0, :]
        y_coords = Y[:, 0]
        
        x_interp = np.interp(j_coords, np.arange(len(x_coords)), x_coords)
        y_interp = np.interp(i_coords, np.arange(len(y_coords)), y_coords)
        
        polygon = [[float(y), float(x)] for x, y in zip(x_interp, y_interp)]
        if len(polygon) >= 3:
            result.append(polygon)
    
    return result

def _simple_contour(X, Y, Z, level):
    mask = Z >= level
    points = []
    
    for i in range(Z.shape[0] - 1):
        for j in range(Z.shape[1] - 1):
            cell = mask[i:i+2, j:j+2]
            if cell.any() and not cell.all():
                cx = (X[i, j] + X[i+1, j+1]) / 2
                cy = (Y[i, j] + Y[i+1, j+1]) / 2
                points.append([float(cy), float(cx)])
    
    if len(points) < 3:
        return []
    
    points = np.array(points)
    center = points.mean(axis=0)
    angles = np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0])
    sorted_indices = np.argsort(angles)
    
    return [points[sorted_indices].tolist()]

def _get_depth_color(depth):
    if depth < 0.1:
        return '#87CEEB'
    elif depth < 0.5:
        return '#4169E1'
    elif depth < 1.0:
        return '#FFD700'
    elif depth < 2.0:
        return '#FF8C00'
    else:
        return '#DC143C'

@main_bp.route('/api/lid/comparison', methods=['POST'])
def run_lid_comparison():
    try:
        data = request.get_json()
        sim_name = data.get('name', 'LID对比')
        subcatchment_id = data.get('subcatchment_id', 'S1')
        area_ratio = data.get('area_ratio', 0.3)
        pavement_thickness = data.get('pavement_thickness', 150)
        void_ratio = data.get('void_ratio', 0.4)
        permeability = data.get('permeability', 100)
        
        lid_manager = LIDManager(INP_FILE)
        result = lid_manager.run_lid_comparison(
            sim_name,
            subcatchment_id,
            {
                'area_ratio': area_ratio,
                'pavement_thickness': pavement_thickness,
                'void_ratio': void_ratio,
                'permeability': permeability
            }
        )
        
        lid_scenario = LIDScenario(
            name=sim_name,
            lid_type='permeable_pavement',
            subcatchment_id=subcatchment_id,
            area_ratio=area_ratio,
            baseline_sim_id=result['baseline_id'],
            lid_sim_id=result['lid_id'],
            flooding_reduction=result['comparison']['flooding_reduction'],
            flow_reduction=result['comparison']['flow_reduction']
        )
        db.session.add(lid_scenario)
        db.session.commit()
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@main_bp.route('/api/lid/scenarios', methods=['GET'])
def get_lid_scenarios():
    scenarios = LIDScenario.query.order_by(LIDScenario.created_at.desc()).all()
    return jsonify([{
        'id': s.id,
        'name': s.name,
        'lid_type': s.lid_type,
        'subcatchment_id': s.subcatchment_id,
        'area_ratio': s.area_ratio,
        'flooding_reduction': s.flooding_reduction,
        'flow_reduction': s.flow_reduction,
        'baseline_sim_id': s.baseline_sim_id,
        'lid_sim_id': s.lid_sim_id,
        'created_at': s.created_at.isoformat()
    } for s in scenarios])

@main_bp.route('/api/calibration/run', methods=['POST'])
def run_calibration():
    try:
        data = request.get_json()
        name = data.get('name', '参数率定')
        n_iterations = int(data.get('n_iterations', 50))
        n_pop = int(data.get('n_pop', 10))
        parameters = data.get('parameters', [])
        
        calibrator = SCEUACalibrator(INP_FILE)
        
        for param in parameters:
            calibrator.add_parameter(
                name=param['name'],
                param_type=param['type'],
                min_val=float(param['min']),
                max_val=float(param['max']),
                subcatchment_id=param.get('subcatchment_id'),
                link_id=param.get('link_id')
            )
        
        result = calibrator.run_calibration(
            name=name,
            n_iterations=n_iterations,
            n_pop=n_pop
        )
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@main_bp.route('/api/calibrations', methods=['GET'])
def get_calibrations():
    calibrations = CalibrationRun.query.order_by(CalibrationRun.created_at.desc()).all()
    return jsonify([{
        'id': c.id,
        'name': c.name,
        'status': c.status,
        'n_parameters': c.n_parameters,
        'n_iterations': c.n_iterations,
        'best_fitness': c.best_fitness,
        'created_at': c.created_at.isoformat()
    } for c in calibrations])

@main_bp.route('/api/animation/export/<int:sim_id>', methods=['POST'])
def export_animation(sim_id):
    try:
        data = request.get_json() or {}
        format_type = data.get('format', 'mp4')
        fps = int(data.get('fps', 5))
        
        exporter = AnimationExporter(sim_id)
        
        if format_type == 'gif':
            result = exporter.export_gif(fps=fps)
        else:
            result = exporter.export_mp4(fps=fps)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@main_bp.route('/api/animation/download/<filename>', methods=['GET'])
def download_animation(filename):
    animation_dir = os.path.join(os.path.dirname(__file__), '../../data/animations')
    filepath = os.path.join(animation_dir, filename)
    
    if os.path.exists(filepath):
        return send_file(filepath, as_attachment=True)
    else:
        return jsonify({'error': 'File not found'}), 404

@main_bp.route('/api/animation/list', methods=['GET'])
def list_animations():
    animation_dir = os.path.join(os.path.dirname(__file__), '../../data/animations')
    os.makedirs(animation_dir, exist_ok=True)
    
    files = []
    for f in os.listdir(animation_dir):
        if f.endswith('.mp4') or f.endswith('.gif'):
            filepath = os.path.join(animation_dir, f)
            files.append({
                'filename': f,
                'size': os.path.getsize(filepath),
                'created_at': datetime.fromtimestamp(os.path.getctime(filepath)).isoformat()
            })
    
    return jsonify(files)
