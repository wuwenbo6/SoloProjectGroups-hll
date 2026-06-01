from flask import Blueprint, request, jsonify, send_from_directory
from app import db
from app.models import Simulation
from app.solvers.fenics_solver import run_simulation
import os

api_bp = Blueprint('api', __name__)

@api_bp.route('/simulations', methods=['GET'])
def get_simulations():
    sims = Simulation.query.order_by(Simulation.created_at.desc()).all()
    return jsonify([sim.to_dict() for sim in sims])

@api_bp.route('/simulations/<int:sim_id>', methods=['GET'])
def get_simulation(sim_id):
    sim = Simulation.query.get_or_404(sim_id)
    return jsonify(sim.to_dict())

@api_bp.route('/simulations', methods=['POST'])
def create_simulation():
    data = request.json
    
    sim = Simulation(
        name=data.get('name', 'Untitled Simulation'),
        description=data.get('description', ''),
        geometry_type=data['geometry_type'],
        geometry_params=data['geometry_params'],
        boundary_conditions=data['boundary_conditions'],
        material_properties=data.get('material_properties', {'E': 200e9, 'nu': 0.3}),
        mesh_refinement=data.get('mesh_refinement', 1)
    )
    
    db.session.add(sim)
    db.session.commit()
    
    return jsonify(sim.to_dict()), 201

@api_bp.route('/simulations/<int:sim_id>/run', methods=['POST'])
def run_simulation_endpoint(sim_id):
    sim = Simulation.query.get_or_404(sim_id)
    sim.status = 'running'
    db.session.commit()
    
    try:
        data = {
            'geometry_type': sim.geometry_type,
            'geometry_params': sim.geometry_params,
            'boundary_conditions': sim.boundary_conditions,
            'material_properties': sim.material_properties,
            'mesh_refinement': sim.mesh_refinement,
            'transient': request.json.get('transient', False) if request.is_json else False,
            'num_steps': request.json.get('num_steps', 10) if request.is_json else 10
        }
        
        result = run_simulation(data)
        
        sim.status = 'completed'
        sim.result_path = result['vtk_file']
        sim.vtu_path = result['vtu_file']
        db.session.commit()
        
        response = {
            'status': 'completed',
            'result': result['result'],
            'vtk_file': result['vtk_file'],
            'vtu_file': result['vtu_file']
        }
        if 'results' in result:
            response['results'] = result['results']
        
        return jsonify(response)
    except Exception as e:
        sim.status = 'failed'
        db.session.commit()
        return jsonify({'status': 'failed', 'error': str(e)}), 500

@api_bp.route('/simulations/<int:sim_id>', methods=['PUT'])
def update_simulation(sim_id):
    sim = Simulation.query.get_or_404(sim_id)
    data = request.json
    
    if 'name' in data:
        sim.name = data['name']
    if 'description' in data:
        sim.description = data['description']
    if 'geometry_type' in data:
        sim.geometry_type = data['geometry_type']
    if 'geometry_params' in data:
        sim.geometry_params = data['geometry_params']
    if 'boundary_conditions' in data:
        sim.boundary_conditions = data['boundary_conditions']
    if 'material_properties' in data:
        sim.material_properties = data['material_properties']
    if 'mesh_refinement' in data:
        sim.mesh_refinement = data['mesh_refinement']
    
    db.session.commit()
    return jsonify(sim.to_dict())

@api_bp.route('/simulations/<int:sim_id>', methods=['DELETE'])
def delete_simulation(sim_id):
    sim = Simulation.query.get_or_404(sim_id)
    
    if sim.result_path:
        result_path = os.path.join('results', sim.result_path)
        if os.path.exists(result_path):
            os.remove(result_path)
    
    db.session.delete(sim)
    db.session.commit()
    return '', 204

@api_bp.route('/results/<filename>')
def get_result(filename):
    return send_from_directory('results', filename)
