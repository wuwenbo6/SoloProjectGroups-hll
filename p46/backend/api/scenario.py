import logging
import threading
import json
import pandas as pd
from flask import Blueprint, request, jsonify, send_file
from datetime import datetime

from .. import db
from ..models.watershed import Watershed
from ..models.scenario import Scenario, ScenarioParameter
from ..models.simulation import Simulation, SimulationResult
from ..utils.swat_runner import SWATRunner
from ..analysis.reporter import ReportGenerator

bp = Blueprint('scenario', __name__)
logger = logging.getLogger(__name__)

PRESET_SCENARIOS = [
    {
        'id': 'baseline',
        'name': '基准情景',
        'description': '当前管理措施下的基准情景',
        'type': 'baseline'
    },
    {
        'id': 'reforestation',
        'name': '退耕还林情景',
        'description': '增加林地覆盖率，减少CN2值',
        'type': 'land_use',
        'parameters': [
            {'name': 'CN2', 'value': -10, 'change_type': 'relative', 'description': '减少曲线数10%'}
        ]
    },
    {
        'id': 'contour_farming',
        'name': '等高耕作情景',
        'description': '等高耕作减少土壤侵蚀',
        'type': 'management',
        'parameters': [
            {'name': 'USLE_P', 'value': 0.5, 'change_type': 'absolute', 'description': '水土保持措施因子'}
        ]
    },
    {
        'id': 'fertilizer_reduction',
        'name': '减肥增效情景',
        'description': '减少化肥施用量20%',
        'type': 'nutrient',
        'parameters': [
            {'name': 'FERT_N', 'value': -20, 'change_type': 'relative', 'description': '减少氮肥20%'}
        ]
    },
    {
        'id': 'irrigation_optimization',
        'name': '节水灌溉情景',
        'description': '优化灌溉管理',
        'type': 'water',
        'parameters': [
            {'name': 'IRRIG', 'value': -15, 'change_type': 'relative', 'description': '减少灌溉量15%'}
        ]
    }
]

@bp.route('/presets', methods=['GET'])
def get_preset_scenarios():
    return jsonify(PRESET_SCENARIOS)

@bp.route('/', methods=['GET'])
def get_scenarios():
    watershed_id = request.args.get('watershed_id', type=int)
    query = Scenario.query
    
    if watershed_id:
        query = query.filter_by(watershed_id=watershed_id)
    
    scenarios = query.all()
    return jsonify([s.to_dict() for s in scenarios])

@bp.route('/<int:scenario_id>', methods=['GET'])
def get_scenario(scenario_id):
    scenario = Scenario.query.get_or_404(scenario_id)
    return jsonify({
        **scenario.to_dict(),
        'parameters': [p.to_dict() for p in scenario.parameters]
    })

@bp.route('/', methods=['POST'])
def create_scenario():
    data = request.get_json()
    
    watershed = Watershed.query.get_or_404(data.get('watershed_id'))
    
    scenario = Scenario(
        watershed_id=watershed.id,
        name=data.get('name'),
        description=data.get('description', ''),
        scenario_type=data.get('scenario_type', 'custom'),
        management_measures=json.dumps(data.get('management_measures', [])),
        is_baseline=data.get('is_baseline', False)
    )
    
    db.session.add(scenario)
    db.session.flush()
    
    parameters = data.get('parameters', [])
    for param in parameters:
        sp = ScenarioParameter(
            scenario_id=scenario.id,
            parameter_name=param.get('name'),
            parameter_value=param.get('value'),
            change_type=param.get('change_type', 'absolute'),
            description=param.get('description', '')
        )
        db.session.add(sp)
    
    db.session.commit()
    
    return jsonify(scenario.to_dict()), 201

@bp.route('/<int:scenario_id>', methods=['DELETE'])
def delete_scenario(scenario_id):
    scenario = Scenario.query.get_or_404(scenario_id)
    db.session.delete(scenario)
    db.session.commit()
    return jsonify({'message': 'Scenario deleted successfully'})

@bp.route('/compare', methods=['POST'])
def compare_scenarios():
    data = request.get_json()
    scenario_ids = data.get('scenario_ids', [])
    variable = data.get('variable', 'streamflow')
    
    if len(scenario_ids) < 2:
        return jsonify({'error': 'At least 2 scenarios required'}), 400
    
    scenarios = Scenario.query.filter(Scenario.id.in_(scenario_ids)).all()
    
    results = {}
    for scenario in scenarios:
        if scenario.simulations:
            latest_sim = scenario.simulations[-1]
            sim_results = SimulationResult.query.filter_by(
                simulation_id=latest_sim.id
            ).all()
            
            df = pd.DataFrame([{
                'date': r.date,
                'streamflow': r.streamflow,
                'sediment_yield': r.sediment_yield,
                'nitrate_load': r.nitrate_load,
                'phosphorus_load': r.phosphorus_load,
                'total_nitrogen': r.total_nitrogen,
                'total_phosphorus': r.total_phosphorus
            } for r in sim_results])
            
            results[str(scenario.id)] = df
    
    comparison = []
    baseline = None
    
    for scenario in scenarios:
        scenario_id = str(scenario.id)
        if scenario_id in results:
            df = results[scenario_id]
            
            if scenario.is_baseline:
                baseline = df
            
            comparison.append({
                'scenario_id': scenario.id,
                'scenario_name': scenario.name,
                'is_baseline': scenario.is_baseline,
                'mean_streamflow': float(df['streamflow'].mean()),
                'total_sediment': float(df['sediment_yield'].sum()),
                'total_nitrogen': float(df['total_nitrogen'].sum()),
                'total_phosphorus': float(df['total_phosphorus'].sum())
            })
    
    if baseline is not None:
        base_flow = float(baseline['streamflow'].mean())
        for item in comparison:
            if not item['is_baseline'] and base_flow > 0:
                item['flow_change_pct'] = (item['mean_streamflow'] - base_flow) / base_flow * 100
    
    return jsonify({
        'comparison': comparison,
        'variable': variable
    })

@bp.route('/<int:scenario_id>/run', methods=['POST'])
def run_scenario_simulation(scenario_id):
    scenario = Scenario.query.get_or_404(scenario_id)
    
    data = request.get_json() or {}
    start_date = data.get('start_date', '2010-01-01')
    end_date = data.get('end_date', '2010-12-31')
    
    simulation = Simulation(
        watershed_id=scenario.watershed_id,
        name=f"{scenario.name} - Simulation",
        start_date=datetime.strptime(start_date, '%Y-%m-%d').date(),
        end_date=datetime.strptime(end_date, '%Y-%m-%d').date()
    )
    
    db.session.add(simulation)
    db.session.flush()
    
    for sp in scenario.parameters:
        from ..models.simulation import SimulationParameter
        sim_param = SimulationParameter(
            simulation_id=simulation.id,
            parameter_name=sp.parameter_name,
            parameter_value=sp.parameter_value,
            change_type=sp.change_type
        )
        db.session.add(sim_param)
    
    db.session.commit()
    
    from .simulation import simulation_threads, _run_simulation_thread
    thread = threading.Thread(
        target=_run_simulation_thread,
        args=(simulation.id,)
    )
    thread.daemon = True
    thread.start()
    simulation_threads[simulation.id] = thread
    
    return jsonify({
        'message': 'Scenario simulation started',
        'simulation_id': simulation.id,
        'scenario_id': scenario_id
    })

@bp.route('/report', methods=['POST'])
def generate_scenario_report():
    if request.is_json:
        data = request.get_json()
        scenario_ids = data.get('scenario_ids', [])
        format_type = data.get('format', 'html')
    else:
        scenario_ids = request.form.get('scenario_ids', '[]')
        scenario_ids = json.loads(scenario_ids) if isinstance(scenario_ids, str) else scenario_ids
        format_type = request.form.get('format', 'html')
    
    scenarios = Scenario.query.filter(Scenario.id.in_(scenario_ids)).all()
    
    results = {}
    for scenario in scenarios:
        if scenario.simulations:
            latest_sim = scenario.simulations[-1]
            sim_results = SimulationResult.query.filter_by(
                simulation_id=latest_sim.id
            ).all()
            
            df = pd.DataFrame([{
                'date': r.date,
                'streamflow': r.streamflow,
                'sediment_yield': r.sediment_yield,
                'nitrate_load': r.nitrate_load,
                'phosphorus_load': r.phosphorus_load,
                'total_nitrogen': r.total_nitrogen,
                'total_phosphorus': r.total_phosphorus
            } for r in sim_results])
            
            results[str(scenario.id)] = df
    
    reporter = ReportGenerator()
    filepath = reporter.generate_scenario_comparison_report(
        [s.to_dict() for s in scenarios],
        results,
        format=format_type
    )
    
    return send_file(filepath, as_attachment=True, download_name=f"scenario_report.{format_type}")
