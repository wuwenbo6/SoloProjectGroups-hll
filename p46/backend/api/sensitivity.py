import logging
import threading
import pandas as pd
from flask import Blueprint, request, jsonify, send_file
from datetime import datetime

from .. import db
from ..models.watershed import Watershed
from ..models.scenario import SensitivityAnalysis, SensitivityParameter, SensitivityResult
from ..utils.swat_runner import SWATRunner
from ..analysis.morris import MorrisAnalyzer
from ..analysis.reporter import ReportGenerator

bp = Blueprint('sensitivity', __name__)
logger = logging.getLogger(__name__)

sensitivity_threads = {}

DEFAULT_SENSITIVITY_PARAMS = [
    {'name': 'CN2', 'min_value': 50, 'max_value': 90},
    {'name': 'SOL_AWC', 'min_value': 0.1, 'max_value': 0.4},
    {'name': 'ESCO', 'min_value': 0.5, 'max_value': 1.0},
    {'name': 'GWQMN', 'min_value': 0, 'max_value': 2000},
    {'name': 'ALPHA_BF', 'min_value': 0.001, 'max_value': 0.1},
    {'name': 'CH_N2', 'min_value': 0.01, 'max_value': 0.1},
    {'name': 'CH_K2', 'min_value': 0, 'max_value': 200},
    {'name': 'SURLAG', 'min_value': 0.5, 'max_value': 10}
]

@bp.route('/defaults', methods=['GET'])
def get_default_parameters():
    return jsonify(DEFAULT_SENSITIVITY_PARAMS)

@bp.route('/', methods=['GET'])
def get_analyses():
    watershed_id = request.args.get('watershed_id', type=int)
    query = SensitivityAnalysis.query
    
    if watershed_id:
        query = query.filter_by(watershed_id=watershed_id)
    
    analyses = query.all()
    return jsonify([a.to_dict() for a in analyses])

@bp.route('/<int:analysis_id>', methods=['GET'])
def get_analysis(analysis_id):
    analysis = SensitivityAnalysis.query.get_or_404(analysis_id)
    return jsonify({
        **analysis.to_dict(),
        'parameters': [p.to_dict() for p in analysis.parameters],
        'results': [r.to_dict() for r in analysis.results]
    })

@bp.route('/', methods=['POST'])
def create_analysis():
    data = request.get_json()
    
    watershed = Watershed.query.get_or_404(data.get('watershed_id'))
    
    analysis = SensitivityAnalysis(
        watershed_id=watershed.id,
        name=data.get('name', 'Sensitivity Analysis'),
        method=data.get('method', 'morris'),
        target_variable=data.get('target_variable', 'streamflow'),
        n_samples=data.get('n_samples', 50),
        n_levels=data.get('n_levels', 4)
    )
    
    db.session.add(analysis)
    db.session.flush()
    
    parameters = data.get('parameters', DEFAULT_SENSITIVITY_PARAMS)
    for param in parameters:
        sp = SensitivityParameter(
            analysis_id=analysis.id,
            parameter_name=param.get('name'),
            min_value=param.get('min_value'),
            max_value=param.get('max_value')
        )
        db.session.add(sp)
    
    db.session.commit()
    
    return jsonify(analysis.to_dict()), 201

@bp.route('/<int:analysis_id>/run', methods=['POST'])
def run_analysis(analysis_id):
    analysis = SensitivityAnalysis.query.get_or_404(analysis_id)
    
    if analysis.status == 'running':
        return jsonify({'error': 'Analysis is already running'}), 400
    
    analysis.status = 'running'
    db.session.commit()
    
    thread = threading.Thread(
        target=_run_analysis_thread,
        args=(analysis_id,)
    )
    thread.daemon = True
    thread.start()
    sensitivity_threads[analysis_id] = thread
    
    return jsonify({'message': 'Sensitivity analysis started', 'analysis_id': analysis_id})

def _run_analysis_thread(analysis_id):
    from ..models.scenario import SensitivityResult
    
    with db.app.app_context():
        analysis = SensitivityAnalysis.query.get(analysis_id)
        watershed = Watershed.query.get(analysis.watershed_id)
        
        try:
            runner = SWATRunner(watershed.project_path)
            
            parameters = []
            for sp in analysis.parameters:
                parameters.append({
                    'name': sp.parameter_name,
                    'min_value': sp.min_value,
                    'max_value': sp.max_value
                })
            
            def progress_callback(status):
                pass
            
            analyzer = MorrisAnalyzer(
                swat_runner=runner,
                parameters=parameters,
                target_variable=analysis.target_variable,
                n_samples=analysis.n_samples,
                n_levels=analysis.n_levels
            )
            
            results = analyzer.run(callback=progress_callback)
            
            SensitivityResult.query.filter_by(analysis_id=analysis_id).delete()
            
            for idx, row in analyzer.sensitivity_indices.iterrows():
                sr = SensitivityResult(
                    analysis_id=analysis_id,
                    parameter_name=row['parameter'],
                    mu_star=row['mu_star'],
                    sigma=row['sigma'],
                    mu=row['mu'],
                    rank=row['rank']
                )
                db.session.add(sr)
            
            analysis.status = 'completed'
            analysis.completed_at = datetime.utcnow()
            
        except Exception as e:
            logger.error(f"Sensitivity analysis failed: {e}", exc_info=True)
            analysis.status = 'failed'
            analysis.error_message = str(e)
        
        db.session.commit()
        
        if analysis_id in sensitivity_threads:
            del sensitivity_threads[analysis_id]

@bp.route('/<int:analysis_id>/status', methods=['GET'])
def get_analysis_status(analysis_id):
    analysis = SensitivityAnalysis.query.get_or_404(analysis_id)
    return jsonify({
        'analysis_id': analysis_id,
        'status': analysis.status,
        'created_at': analysis.created_at.isoformat() if analysis.created_at else None,
        'completed_at': analysis.completed_at.isoformat() if analysis.completed_at else None,
        'error_message': analysis.error_message
    })

@bp.route('/<int:analysis_id>/results', methods=['GET'])
def get_analysis_results(analysis_id):
    analysis = SensitivityAnalysis.query.get_or_404(analysis_id)
    
    results = SensitivityResult.query.filter_by(
        analysis_id=analysis_id
    ).order_by(SensitivityResult.rank).all()
    
    return jsonify({
        'analysis_id': analysis_id,
        'analysis_name': analysis.name,
        'method': analysis.method,
        'target_variable': analysis.target_variable,
        'n_samples': analysis.n_samples,
        'n_levels': analysis.n_levels,
        'results': [r.to_dict() for r in results]
    })

@bp.route('/<int:analysis_id>/report', methods=['GET'])
def generate_sensitivity_report(analysis_id):
    format_type = request.args.get('format', 'html')
    
    analysis = SensitivityAnalysis.query.get_or_404(analysis_id)
    results = SensitivityResult.query.filter_by(
        analysis_id=analysis_id
    ).order_by(SensitivityResult.rank).all()
    
    reporter = ReportGenerator()
    filepath = reporter.generate_sensitivity_report(
        analysis.to_dict(),
        [r.to_dict() for r in results],
        format=format_type
    )
    
    return send_file(filepath, as_attachment=True, 
                     download_name=f"sensitivity_report_{analysis_id}.{format_type}")

@bp.route('/<int:analysis_id>', methods=['DELETE'])
def delete_analysis(analysis_id):
    analysis = SensitivityAnalysis.query.get_or_404(analysis_id)
    
    if analysis_id in sensitivity_threads:
        return jsonify({'error': 'Cannot delete running analysis'}), 400
    
    db.session.delete(analysis)
    db.session.commit()
    
    return jsonify({'message': 'Sensitivity analysis deleted successfully'})
