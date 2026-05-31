import logging
from flask import Blueprint, request, jsonify
import pandas as pd

from .. import db
from ..models.simulation import Simulation, SimulationResult
from ..utils.data_processor import DataProcessor

bp = Blueprint('results', __name__)
logger = logging.getLogger(__name__)

@bp.route('/simulation/<int:simulation_id>', methods=['GET'])
def get_simulation_results(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    
    subbasin = request.args.get('subbasin', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    agg_interval = request.args.get('aggregate', 'daily')
    
    query = SimulationResult.query.filter_by(simulation_id=simulation_id)
    
    if subbasin:
        query = query.filter_by(subbasin_number=subbasin)
    
    if start_date:
        query = query.filter(SimulationResult.date >= start_date)
    
    if end_date:
        query = query.filter(SimulationResult.date <= end_date)
    
    results = query.order_by(SimulationResult.date).all()
    
    results_df = pd.DataFrame([r.to_dict() for r in results])
    
    if len(results_df) > 0:
        results_df['date'] = pd.to_datetime(results_df['date'])
        results_df = DataProcessor.aggregate_results(results_df, agg_interval)
        results_list = DataProcessor.results_to_json(results_df)
        
        return jsonify({
            'simulation_id': simulation_id,
            'count': len(results_df),
            'aggregate': agg_interval,
            'data': results_list
        })
    else:
        return jsonify({
            'simulation_id': simulation_id,
            'count': 0,
            'aggregate': agg_interval,
            'data': []
        })

@bp.route('/simulation/<int:simulation_id>/summary', methods=['GET'])
def get_simulation_summary(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    
    results = SimulationResult.query.filter_by(
        simulation_id=simulation_id
    ).all()
    
    if not results:
        return jsonify({'error': 'No results found'}), 404
    
    results_df = pd.DataFrame([r.to_dict() for r in results])
    results_df['date'] = pd.to_datetime(results_df['date'])
    
    summary = DataProcessor.calculate_water_balance(results_df)
    
    summary.update({
        'simulation_id': simulation_id,
        'simulation_name': simulation.name,
        'start_date': results_df['date'].min().strftime('%Y-%m-%d'),
        'end_date': results_df['date'].max().strftime('%Y-%m-%d'),
        'n_days': len(results_df)
    })
    
    return jsonify(summary)

@bp.route('/simulation/<int:simulation_id>/timeseries', methods=['GET'])
def get_timeseries(simulation_id):
    variable = request.args.get('variable', 'streamflow')
    subbasin = request.args.get('subbasin', type=int)
    
    query = SimulationResult.query.filter_by(simulation_id=simulation_id)
    if subbasin:
        query = query.filter_by(subbasin_number=subbasin)
    
    results = query.order_by(SimulationResult.date).all()
    
    valid_variables = {
        'streamflow': '径流 (m³/s)',
        'sediment_yield': '泥沙产量 (t)',
        'nitrate_load': '硝氮负荷 (kg)',
        'phosphorus_load': '磷负荷 (kg)',
        'total_nitrogen': '总氮 (kg)',
        'total_phosphorus': '总磷 (kg)'
    }
    
    if variable not in valid_variables:
        return jsonify({'error': f'Invalid variable: {variable}'}), 400
    
    dates = []
    values = []
    for r in results:
        dates.append(r.date.strftime('%Y-%m-%d'))
        values.append(getattr(r, variable))
    
    return jsonify({
        'simulation_id': simulation_id,
        'variable': variable,
        'variable_name': valid_variables[variable],
        'dates': dates,
        'values': values
    })

@bp.route('/compare', methods=['POST'])
def compare_simulations():
    data = request.get_json()
    simulation_ids = data.get('simulation_ids', [])
    variable = data.get('variable', 'streamflow')
    
    if len(simulation_ids) < 2:
        return jsonify({'error': 'At least 2 simulations are required for comparison'}), 400
    
    results = []
    for sim_id in simulation_ids:
        simulation = Simulation.query.get(sim_id)
        if not simulation:
            continue
            
        sim_results = SimulationResult.query.filter_by(
            simulation_id=sim_id
        ).order_by(SimulationResult.date).all()
        
        dates = []
        values = []
        for r in sim_results:
            dates.append(r.date.strftime('%Y-%m-%d'))
            values.append(getattr(r, variable))
        
        results.append({
            'simulation_id': sim_id,
            'simulation_name': simulation.name,
            'dates': dates,
            'values': values
        })
    
    return jsonify({
        'variable': variable,
        'simulations': results
    })

@bp.route('/simulation/<int:simulation_id>/statistics', methods=['GET'])
def get_statistics(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    
    results = SimulationResult.query.filter_by(
        simulation_id=simulation_id
    ).all()
    
    if not results:
        return jsonify({'error': 'No results found'}), 404
    
    variables = ['streamflow', 'sediment_yield', 'nitrate_load', 
                 'phosphorus_load', 'total_nitrogen', 'total_phosphorus']
    
    statistics = {}
    for var in variables:
        values = [getattr(r, var) for r in results if getattr(r, var) is not None]
        if values:
            statistics[var] = {
                'mean': float(pd.Series(values).mean()),
                'std': float(pd.Series(values).std()),
                'min': float(pd.Series(values).min()),
                'max': float(pd.Series(values).max()),
                'median': float(pd.Series(values).median()),
                'sum': float(pd.Series(values).sum())
            }
    
    return jsonify({
        'simulation_id': simulation_id,
        'statistics': statistics
    })

@bp.route('/simulation/<int:simulation_id>/export', methods=['GET'])
def export_results(simulation_id):
    simulation = Simulation.query.get_or_404(simulation_id)
    format_type = request.args.get('format', 'csv')
    
    results = SimulationResult.query.filter_by(
        simulation_id=simulation_id
    ).order_by(SimulationResult.date).all()
    
    results_df = pd.DataFrame([{
        'date': r.date.strftime('%Y-%m-%d'),
        'subbasin': r.subbasin_number,
        'streamflow': r.streamflow,
        'sediment_yield': r.sediment_yield,
        'nitrate_load': r.nitrate_load,
        'phosphorus_load': r.phosphorus_load,
        'total_nitrogen': r.total_nitrogen,
        'total_phosphorus': r.total_phosphorus
    } for r in results])
    
    if format_type == 'csv':
        return jsonify({
            'format': 'csv',
            'filename': f'simulation_{simulation_id}_results.csv',
            'data': results_df.to_csv(index=False)
        })
    elif format_type == 'json':
        return jsonify({
            'format': 'json',
            'filename': f'simulation_{simulation_id}_results.json',
            'data': results_df.to_dict(orient='records')
        })
    else:
        return jsonify({'error': f'Unsupported format: {format_type}'}), 400
