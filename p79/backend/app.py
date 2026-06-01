from flask import Flask, jsonify, request, send_from_directory, make_response
from flask_cors import CORS
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SimulationDatabase
from simple_simulator import SimpleSimulator
from risk_analysis import PropertyDamageAssessor, EvacuationRouter, RiskMapExporter

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
db = SimulationDatabase()
simulator = SimpleSimulator()
SIMULATOR_TYPE = 'Simple'
damage_assessor = PropertyDamageAssessor()
evacuation_router = EvacuationRouter()
pdf_exporter = RiskMapExporter()


@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')


@app.route('/api/simulate', methods=['POST'])
def run_simulation():
    try:
        data = request.get_json()
        return_period = data.get('return_period', 2)
        
        if return_period not in [2, 50]:
            return jsonify({'error': 'Unsupported return period. Use 2 or 50'}), 400
        
        existing = db.get_simulation(return_period)
        if existing:
            return jsonify({
                'message': 'Simulation already exists',
                'return_period': return_period,
                'data': existing
            })
        
        results = simulator.run_simulation(return_period)
        depth_points = simulator.generate_depth_points(results)
        
        sim_id = db.save_simulation(results, depth_points)
        
        return jsonify({
            'message': 'Simulation completed successfully',
            'return_period': return_period,
            'simulation_id': sim_id,
            'depth_points_count': len(depth_points),
            'data': {
                'simulation_id': sim_id,
                'return_period': return_period,
                'nodes': results['max_flooding'],
                'depth_points': depth_points
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/simulation/<int:return_period>', methods=['GET'])
def get_simulation(return_period):
    try:
        data = db.get_simulation(return_period)
        
        if not data:
            return jsonify({'error': 'Simulation not found'}), 404
        
        return jsonify({
            'return_period': return_period,
            'data': data
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/simulations', methods=['GET'])
def list_simulations():
    try:
        periods = db.get_available_return_periods()
        return jsonify({
            'available_return_periods': periods
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/simulation/<int:return_period>', methods=['DELETE'])
def delete_simulation(return_period):
    try:
        count = db.delete_simulation(return_period)
        return jsonify({
            'message': f'Deleted {count} simulation(s)',
            'return_period': return_period
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/contour/<int:return_period>', methods=['GET'])
def get_contour_data(return_period):
    try:
        data = db.get_simulation(return_period)
        
        if not data:
            return jsonify({'error': 'Simulation not found'}), 404
        
        depth_points = data['depth_points']
        
        levels = [0.1, 0.3, 0.5, 1.0, 2.0]
        colors = ['#ffffcc', '#c7e9b4', '#7fcdbb', '#41b6c4', '#2c7fb8', '#253494']
        
        return jsonify({
            'return_period': return_period,
            'depth_points': depth_points,
            'nodes': data['nodes'],
            'levels': levels,
            'colors': colors
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'simulator': SIMULATOR_TYPE})


@app.route('/api/damage-assessment/<int:return_period>', methods=['GET'])
def get_damage_assessment(return_period):
    try:
        data = db.get_simulation(return_period)
        if not data:
            return jsonify({'error': 'Simulation not found'}), 404
        
        damage_result = damage_assessor.assess_damage(data['depth_points'])
        
        return jsonify({
            'return_period': return_period,
            'damage_assessment': damage_result
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/evacuation-route', methods=['POST'])
def get_evacuation_routes():
    try:
        data = request.get_json()
        return_period = data.get('return_period', 2)
        start_lon = data.get('lon', 116.400)
        start_lat = data.get('lat', 39.900)
        
        sim_data = db.get_simulation(return_period)
        if not sim_data:
            return jsonify({'error': 'Simulation not found. Run simulation first.'}), 404
        
        routes_result = evacuation_router.find_evacuation_routes(
            start_lon, start_lat, sim_data['depth_points']
        )
        
        return jsonify({
            'return_period': return_period,
            'start_location': {'lon': start_lon, 'lat': start_lat},
            'evacuation_data': routes_result
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/export-pdf/<int:return_period>', methods=['GET'])
def export_pdf_report(return_period):
    try:
        sim_data = db.get_simulation(return_period)
        if not sim_data:
            return jsonify({'error': 'Simulation not found'}), 404
        
        damage_result = damage_assessor.assess_damage(sim_data['depth_points'])
        
        pdf_buffer = pdf_exporter.create_pdf_report(
            sim_data, damage_result, return_period
        )
        
        response = make_response(pdf_buffer.getvalue())
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'attachment; filename="flood_risk_report_{return_period}yr.pdf"'
        
        return response
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/safe-zones', methods=['GET'])
def get_safe_zones():
    try:
        return jsonify({
            'safe_zones': evacuation_router.safe_zones
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
