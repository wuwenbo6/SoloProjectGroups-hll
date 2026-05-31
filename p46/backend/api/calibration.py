import logging
import threading
import json
from datetime import datetime
from flask import Blueprint, request, jsonify

from .. import db
from ..models.watershed import Watershed
from ..models.calibration import CalibrationRun, CalibrationParameter, CalibrationResult
from ..utils.swat_runner import SWATRunner
from ..utils.data_processor import DataProcessor
from ..calibration.sufi2 import SUFI2

bp = Blueprint('calibration', __name__)
logger = logging.getLogger(__name__)

calibration_threads = {}

@bp.route('/', methods=['GET'])
def get_calibration_runs():
    watershed_id = request.args.get('watershed_id', type=int)
    query = CalibrationRun.query
    
    if watershed_id:
        query = query.filter_by(watershed_id=watershed_id)
    
    runs = query.all()
    return jsonify([r.to_dict() for r in runs])

@bp.route('/<int:calibration_id>', methods=['GET'])
def get_calibration_run(calibration_id):
    run = CalibrationRun.query.get_or_404(calibration_id)
    return jsonify(run.to_dict())

@bp.route('/', methods=['POST'])
def create_calibration():
    data = request.get_json()
    
    watershed = Watershed.query.get_or_404(data.get('watershed_id'))
    
    calibration = CalibrationRun(
        watershed_id=watershed.id,
        name=data.get('name', 'Unnamed Calibration'),
        algorithm=data.get('algorithm', 'SUFI2'),
        total_iterations=data.get('total_iterations', 100),
        n_samples=data.get('n_samples', 500),
        objective_function=data.get('objective_function', 'NSE'),
        target_variable=data.get('target_variable', 'streamflow')
    )
    
    db.session.add(calibration)
    db.session.flush()
    
    parameters = data.get('parameters', [])
    for param in parameters:
        calib_param = CalibrationParameter(
            calibration_run_id=calibration.id,
            parameter_name=param.get('name'),
            min_value=param.get('min_value'),
            max_value=param.get('max_value'),
            initial_value=param.get('initial_value'),
            distribution=param.get('distribution', 'uniform'),
            change_type=param.get('change_type', 'relative')
        )
        db.session.add(calib_param)
    
    db.session.commit()
    
    return jsonify(calibration.to_dict()), 201

@bp.route('/<int:calibration_id>/run', methods=['POST'])
def run_calibration(calibration_id):
    calibration = CalibrationRun.query.get_or_404(calibration_id)
    
    if calibration.status == 'running':
        return jsonify({'error': 'Calibration is already running'}), 400
    
    calibration.status = 'running'
    calibration.current_iteration = 0
    db.session.commit()
    
    thread = threading.Thread(
        target=_run_calibration_thread,
        args=(calibration_id,)
    )
    thread.daemon = True
    thread.start()
    calibration_threads[calibration_id] = thread
    
    return jsonify({'message': 'Calibration started', 'calibration_id': calibration_id})

def _run_calibration_thread(calibration_id):
    with db.app.app_context():
        calibration = CalibrationRun.query.get(calibration_id)
        watershed = Watershed.query.get(calibration.watershed_id)
        
        try:
            runner = SWATRunner(watershed.project_path)
            
            parameters = []
            for param in calibration.parameters:
                parameters.append({
                    'name': param.parameter_name,
                    'min_value': param.min_value,
                    'max_value': param.max_value,
                    'initial_value': param.initial_value,
                    'distribution': param.distribution,
                    'change_type': param.change_type
                })
            
            observed_data = _get_observed_data(calibration_id)
            
            def progress_callback(iteration_result):
                calibration.current_iteration = iteration_result['iteration']
                
                result = CalibrationResult(
                    calibration_run_id=calibration_id,
                    iteration=iteration_result['iteration'],
                    parameter_values=json.dumps({}),
                    objective_value=iteration_result['best_objective'],
                    p_factor=iteration_result.get('p_factor'),
                    r_factor=iteration_result.get('r_factor')
                )
                db.session.add(result)
                db.session.commit()
            
            sufi2 = SUFI2(
                swat_runner=runner,
                parameters=parameters,
                observed_data=observed_data,
                objective_func=calibration.objective_function,
                target_variable=calibration.target_variable,
                n_samples=calibration.n_samples,
                max_iterations=calibration.total_iterations
            )
            
            results = sufi2.run(callback=progress_callback)
            
            best_result = CalibrationResult(
                calibration_run_id=calibration_id,
                iteration=calibration.total_iterations,
                parameter_values=json.dumps(results['best_parameters']),
                objective_value=results['best_objective'],
                is_best=True
            )
            db.session.add(best_result)
            
            calibration.status = 'completed'
            calibration.completed_at = datetime.utcnow()
            
        except Exception as e:
            logger.error(f"Calibration failed: {e}")
            calibration.status = 'failed'
            calibration.error_message = str(e)
        
        db.session.commit()
        
        if calibration_id in calibration_threads:
            del calibration_threads[calibration_id]

def _get_observed_data(calibration_id):
    import pandas as pd
    import numpy as np
    from datetime import datetime
    
    dates = pd.date_range(start='2010-01-01', end='2010-12-31', freq='D')
    np.random.seed(42)
    
    base_flow = 10 + 5 * np.sin(np.linspace(0, 4*np.pi, len(dates)))
    noise = np.random.normal(0, 1.5, len(dates))
    observed_flow = np.maximum(0.5, base_flow + noise)
    
    return pd.DataFrame({
        'date': dates,
        'streamflow': observed_flow
    })

@bp.route('/<int:calibration_id>/status', methods=['GET'])
def get_calibration_status(calibration_id):
    calibration = CalibrationRun.query.get_or_404(calibration_id)
    
    results = CalibrationResult.query.filter_by(
        calibration_run_id=calibration_id
    ).order_by(CalibrationResult.iteration).all()
    
    history = []
    for r in results:
        history.append({
            'iteration': r.iteration,
            'objective_value': r.objective_value,
            'p_factor': r.p_factor,
            'r_factor': r.r_factor,
            'is_best': r.is_best
        })
    
    return jsonify({
        'calibration_id': calibration_id,
        'status': calibration.status,
        'current_iteration': calibration.current_iteration,
        'total_iterations': calibration.total_iterations,
        'history': history,
        'created_at': calibration.created_at.isoformat() if calibration.created_at else None,
        'completed_at': calibration.completed_at.isoformat() if calibration.completed_at else None,
        'error_message': calibration.error_message
    })

@bp.route('/<int:calibration_id>/parameters', methods=['GET'])
def get_calibration_parameters(calibration_id):
    calibration = CalibrationRun.query.get_or_404(calibration_id)
    return jsonify([p.to_dict() for p in calibration.parameters])

@bp.route('/<int:calibration_id>/results', methods=['GET'])
def get_calibration_results(calibration_id):
    results = CalibrationResult.query.filter_by(
        calibration_run_id=calibration_id
    ).order_by(CalibrationResult.iteration).all()
    
    return jsonify([r.to_dict() for r in results])

@bp.route('/<int:calibration_id>/best', methods=['GET'])
def get_best_calibration(calibration_id):
    best_result = CalibrationResult.query.filter_by(
        calibration_run_id=calibration_id,
        is_best=True
    ).first()
    
    if not best_result:
        best_result = CalibrationResult.query.filter_by(
            calibration_run_id=calibration_id
        ).order_by(CalibrationResult.objective_value.desc()).first()
    
    if best_result:
        return jsonify(best_result.to_dict())
    else:
        return jsonify({'error': 'No results found'}), 404

@bp.route('/<int:calibration_id>', methods=['DELETE'])
def delete_calibration(calibration_id):
    calibration = CalibrationRun.query.get_or_404(calibration_id)
    
    if calibration_id in calibration_threads:
        return jsonify({'error': 'Cannot delete running calibration'}), 400
    
    db.session.delete(calibration)
    db.session.commit()
    
    return jsonify({'message': 'Calibration deleted successfully'})

@bp.route('/algorithms', methods=['GET'])
def get_algorithms():
    return jsonify([
        {
            'id': 'SUFI2',
            'name': 'SUFI-2',
            'description': 'Sequential Uncertainty Fitting - Version 2',
            'supports_uncertainty': True
        }
    ])

@bp.route('/objective-functions', methods=['GET'])
def get_objective_functions():
    return jsonify([
        {'id': 'NSE', 'name': 'Nash-Sutcliffe Efficiency', 'maximize': True},
        {'id': 'KGE', 'name': 'Kling-Gupta Efficiency', 'maximize': True},
        {'id': 'RMSE', 'name': 'Root Mean Square Error', 'maximize': False},
        {'id': 'MAE', 'name': 'Mean Absolute Error', 'maximize': False},
        {'id': 'R2', 'name': 'Coefficient of Determination', 'maximize': True},
        {'id': 'PBIAS', 'name': 'Percent Bias', 'maximize': False},
        {'id': 'LOG_NSE', 'name': 'Log-transformed NSE', 'maximize': True}
    ])
