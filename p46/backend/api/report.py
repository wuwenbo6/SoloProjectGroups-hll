import logging
import pandas as pd
from flask import Blueprint, request, jsonify, send_file
from datetime import datetime

from .. import db
from ..models.simulation import Simulation, SimulationResult
from ..models.calibration import CalibrationRun, CalibrationResult
from ..analysis.reporter import ReportGenerator

bp = Blueprint('report', __name__)
logger = logging.getLogger(__name__)

@bp.route('/simulation/<int:simulation_id>', methods=['GET'])
def simulation_report(simulation_id):
    format_type = request.args.get('format', 'html')
    
    simulation = Simulation.query.get_or_404(simulation_id)
    results = SimulationResult.query.filter_by(
        simulation_id=simulation_id
    ).all()
    
    results_df = pd.DataFrame([{
        'date': r.date,
        'streamflow': r.streamflow,
        'sediment_yield': r.sediment_yield,
        'nitrate_load': r.nitrate_load,
        'phosphorus_load': r.phosphorus_load,
        'total_nitrogen': r.total_nitrogen,
        'total_phosphorus': r.total_phosphorus
    } for r in results])
    
    parameters = [p.to_dict() for p in simulation.parameters]
    
    reporter = ReportGenerator()
    filepath = reporter.generate_simulation_report(
        simulation.to_dict(),
        results_df,
        parameters,
        format=format_type
    )
    
    return send_file(filepath, as_attachment=True, 
                     download_name=f"simulation_report_{simulation_id}.{format_type}")

@bp.route('/calibration/<int:calibration_id>', methods=['GET'])
def calibration_report(calibration_id):
    format_type = request.args.get('format', 'html')
    
    calibration = CalibrationRun.query.get_or_404(calibration_id)
    results = CalibrationResult.query.filter_by(
        calibration_run_id=calibration_id
    ).all()
    
    reporter = ReportGenerator()
    filepath = reporter.generate_calibration_report(
        calibration.to_dict(),
        [r.to_dict() for r in results],
        format=format_type
    )
    
    return send_file(filepath, as_attachment=True, 
                     download_name=f"calibration_report_{calibration_id}.{format_type}")

@bp.route('/types', methods=['GET'])
def get_report_types():
    return jsonify([
        {
            'id': 'simulation',
            'name': '模拟报告',
            'description': '单情景模拟结果详细报告',
            'formats': ['html', 'json']
        },
        {
            'id': 'scenario',
            'name': '情景对比报告',
            'description': '多管理措施情景对比分析报告',
            'formats': ['html']
        },
        {
            'id': 'sensitivity',
            'name': '敏感度分析报告',
            'description': '参数敏感度分析结果报告',
            'formats': ['html']
        },
        {
            'id': 'calibration',
            'name': '校准报告',
            'description': 'SUFI-2参数校准结果报告',
            'formats': ['html']
        }
    ])
