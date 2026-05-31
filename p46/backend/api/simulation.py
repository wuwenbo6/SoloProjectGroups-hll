import logging
import threading
import pandas as pd
from datetime import datetime
from flask import Blueprint, request, jsonify

from .. import db
from ..models.watershed import Watershed
from ..models.simulation import Simulation, SimulationParameter, SimulationResult
from ..utils.swat_runner import SWATRunner

bp = Blueprint('simulation', __name__)
logger = logging.getLogger(__name__)

simulation_threads = {}

@bp.route('/', methods=['GET'])
def get_simulations():
    watershed_id = request.args.get('watershed_id', type=int)
    query = Simulation.query
    
    if watershed_id:
        query = query.filter_by(watershed_id=watershed_id)
    
    simulations = query.all()
    return jsonify([s.to_dict() for s in simulations])

@bp.route('/<int:simulation_id>', methods=['GET'])
def get_simulation(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    return jsonify(simulation.to_dict())

@bp.route('/', methods=['POST'])
def create_simulation():
    data = request.get_json()
    
    watershed = Watershed.query.get_or_404(data.get('watershed_id'))
    
    start_date = None
    if data.get('start_date'):
        start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
    
    end_date = None
    if data.get('end_date'):
        end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
    
    simulation = Simulation(
        watershed_id=watershed.id,
        name=data.get('name', 'Unnamed Simulation'),
        description=data.get('description', ''),
        start_date=start_date,
        end_date=end_date,
        output_interval=data.get('output_interval', 'daily')
    )
    
    db.session.add(simulation)
    db.session.flush()
    
    parameters = data.get('parameters', [])
    for param in parameters:
        sim_param = SimulationParameter(
            simulation_id=simulation.id,
            parameter_name=param.get('name'),
            parameter_value=param.get('value'),
            subbasin_number=param.get('subbasin'),
            change_type=param.get('change_type', 'absolute')
        )
        db.session.add(sim_param)
    
    db.session.commit()
    
    return jsonify(simulation.to_dict()), 201

@bp.route('/<int:simulation_id>/run', methods=['POST'])
def run_simulation(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    
    if simulation.status == 'running':
        return jsonify({'error': 'Simulation is already running'}), 400
    
    simulation.status = 'running'
    db.session.commit()
    
    thread = threading.Thread(
        target=_run_simulation_thread,
        args=(simulation_id,)
    )
    thread.daemon = True
    thread.start()
    simulation_threads[simulation_id] = thread
    
    return jsonify({'message': 'Simulation started', 'simulation_id': simulation_id})

def _run_simulation_thread(simulation_id):
    BATCH_SIZE = 1000
    
    with db.app.app_context():
        simulation = Simulation.query.get(simulation_id)
        watershed = Watershed.query.get(simulation.watershed_id)
        
        try:
            runner = SWATRunner(watershed.project_path)
            
            params = []
            for param in simulation.parameters:
                params.append({
                    'name': param.parameter_name,
                    'value': param.parameter_value,
                    'subbasin': param.subbasin_number,
                    'change_type': param.change_type
                })
            runner.set_parameters(params)
            
            start_date = simulation.start_date.isoformat() if simulation.start_date else None
            end_date = simulation.end_date.isoformat() if simulation.end_date else None
            
            results = runner.run(
                start_date=start_date,
                end_date=end_date,
                output_interval=simulation.output_interval
            )
            
            logger.info(f"Simulation generated {len(results)} rows of results")
            
            SimulationResult.query.filter_by(simulation_id=simulation_id).delete()
            db.session.commit()
            
            batch = []
            for idx, row in results.iterrows():
                date_val = row['date'].date() if hasattr(row['date'], 'date') else row['date']
                
                result = SimulationResult(
                    simulation_id=simulation_id,
                    subbasin_number=int(row.get('subbasin', 1)) if pd.notna(row.get('subbasin')) else 1,
                    date=date_val,
                    streamflow=float(row['streamflow']) if pd.notna(row.get('streamflow')) else None,
                    sediment_yield=float(row['sediment_yield']) if pd.notna(row.get('sediment_yield')) else None,
                    nitrate_load=float(row['nitrate_load']) if pd.notna(row.get('nitrate_load')) else None,
                    phosphorus_load=float(row['phosphorus_load']) if pd.notna(row.get('phosphorus_load')) else None,
                    total_nitrogen=float(row['total_nitrogen']) if pd.notna(row.get('total_nitrogen')) else None,
                    total_phosphorus=float(row['total_phosphorus']) if pd.notna(row.get('total_phosphorus')) else None
                )
                batch.append(result)
                
                if len(batch) >= BATCH_SIZE:
                    db.session.bulk_save_objects(batch)
                    db.session.commit()
                    logger.info(f"Committed batch of {len(batch)} results")
                    batch = []
            
            if batch:
                db.session.bulk_save_objects(batch)
                db.session.commit()
                logger.info(f"Committed final batch of {len(batch)} results")
            
            simulation.status = 'completed'
            simulation.completed_at = datetime.utcnow()
            logger.info(f"Simulation completed successfully, total results: {len(results)}")
            
        except Exception as e:
            logger.error(f"Simulation failed: {e}", exc_info=True)
            simulation.status = 'failed'
            simulation.error_message = str(e)
            try:
                db.session.rollback()
            except:
                pass
        
        db.session.commit()
        
        if simulation_id in simulation_threads:
            del simulation_threads[simulation_id]

@bp.route('/<int:simulation_id>/status', methods=['GET'])
def get_simulation_status(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    return jsonify({
        'simulation_id': simulation_id,
        'status': simulation.status,
        'created_at': simulation.created_at.isoformat() if simulation.created_at else None,
        'completed_at': simulation.completed_at.isoformat() if simulation.completed_at else None,
        'error_message': simulation.error_message
    })

@bp.route('/<int:simulation_id>/parameters', methods=['GET'])
def get_simulation_parameters(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    return jsonify([p.to_dict() for p in simulation.parameters])

@bp.route('/<int:simulation_id>', methods=['DELETE'])
def delete_simulation(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    
    if simulation_id in simulation_threads:
        return jsonify({'error': 'Cannot delete running simulation'}), 400
    
    db.session.delete(simulation)
    db.session.commit()
    
    return jsonify({'message': 'Simulation deleted successfully'})
