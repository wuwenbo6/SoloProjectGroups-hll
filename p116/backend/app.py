from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime, timedelta
import os

from .tle_manager import TLEManager
from .sgp4_propagator import SGP4Propagator
from .predictor import PassPredictor
from .collision_warning import CollisionWarning
from .kml_exporter import KMLExporter

app = Flask(__name__)
CORS(app)

tle_manager = TLEManager()

@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)

@app.route('/api/tles', methods=['GET'])
def get_tles():
    tles = tle_manager.get_all_tles()
    return jsonify([{
        'id': t.id,
        'norad_id': t.norad_id,
        'name': t.name,
        'line1': t.line1,
        'line2': t.line2,
        'source': t.source,
        'updated_at': t.updated_at.isoformat(),
        'description': t.description,
        'version': t.version,
        'transition_minutes': t.transition_minutes
    } for t in tles])

@app.route('/api/tles/<norad_id>', methods=['GET'])
def get_tle(norad_id):
    tle = tle_manager.get_tle(norad_id)
    if not tle:
        return jsonify({'error': 'TLE not found'}), 404
    return jsonify({
        'id': tle.id,
        'norad_id': tle.norad_id,
        'name': tle.name,
        'line1': tle.line1,
        'line2': tle.line2,
        'source': tle.source,
        'updated_at': tle.updated_at.isoformat(),
        'description': tle.description,
        'version': tle.version,
        'transition_minutes': tle.transition_minutes
    })

@app.route('/api/tles/<norad_id>/history', methods=['GET'])
def get_tle_history(norad_id):
    data = tle_manager.get_tle_with_history(norad_id)
    if not data:
        return jsonify({'error': 'TLE not found'}), 404
    
    return jsonify({
        'norad_id': norad_id,
        'current': {
            'version': data['current'].version,
            'line1': data['current'].line1,
            'line2': data['current'].line2,
            'updated_at': data['current'].updated_at.isoformat()
        },
        'history': [{
            'id': h.id,
            'line1': h.line1,
            'line2': h.line2,
            'epoch': h.epoch.isoformat() if h.epoch else None,
            'replaced_at': h.replaced_at.isoformat() if h.replaced_at else None,
            'version': h.version,
            'bstar': h.bstar,
            'inclination': h.inclination,
            'eccentricity': h.eccentricity,
            'period': h.period
        } for h in data['history']]
    })

@app.route('/api/satellite/<norad_id>/prediction-error', methods=['GET'])
def get_prediction_error(norad_id):
    tle = tle_manager.get_tle(norad_id)
    if not tle:
        return jsonify({'error': 'TLE not found'}), 404
    
    try:
        hours = float(request.args.get('hours', 24))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid hours parameter'}), 400
    
    propagator = SGP4Propagator(tle.line1, tle.line2)
    error = propagator.estimate_prediction_error(hours)
    
    return jsonify({
        'norad_id': norad_id,
        'name': tle.name,
        'prediction_error': error
    })

@app.route('/api/tles', methods=['POST'])
def add_tle():
    data = request.json
    required = ['norad_id', 'name', 'line1', 'line2']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing required fields'}), 400
    
    tle = tle_manager.add_tle(
        norad_id=data['norad_id'],
        name=data['name'],
        line1=data['line1'],
        line2=data['line2'],
        source=data.get('source', 'manual'),
        description=data.get('description')
    )
    return jsonify({'message': 'TLE added/updated successfully', 'norad_id': tle.norad_id})

@app.route('/api/tles/<norad_id>', methods=['DELETE'])
def delete_tle(norad_id):
    success = tle_manager.delete_tle(norad_id)
    if not success:
        return jsonify({'error': 'TLE not found'}), 404
    return jsonify({'message': 'TLE deleted successfully'})

@app.route('/api/tles/search', methods=['GET'])
def search_tles():
    query = request.args.get('q', '')
    tles = tle_manager.search_tles(query)
    return jsonify([{
        'norad_id': t.norad_id,
        'name': t.name,
        'line1': t.line1,
        'line2': t.line2,
        'description': t.description
    } for t in tles])

@app.route('/api/satellite/<norad_id>/position', methods=['GET'])
def get_satellite_position(norad_id):
    tle = tle_manager.get_tle(norad_id)
    if not tle:
        return jsonify({'error': 'TLE not found'}), 404
    
    time_str = request.args.get('time')
    if time_str:
        dt = datetime.fromisoformat(time_str)
    else:
        dt = datetime.utcnow()
    
    propagator = SGP4Propagator(tle.line1, tle.line2)
    pos = propagator.get_position_at_time(dt)
    if not pos:
        return jsonify({'error': 'Propagation error'}), 500
    
    lla = propagator.eci_to_lla(pos['x'], pos['y'], pos['z'], dt)
    
    return jsonify({
        'norad_id': norad_id,
        'name': tle.name,
        'time': dt.isoformat(),
        'eci': pos,
        'lla': lla
    })

@app.route('/api/satellite/<norad_id>/groundtrack', methods=['GET'])
def get_ground_track(norad_id):
    tle = tle_manager.get_tle(norad_id)
    if not tle:
        return jsonify({'error': 'TLE not found'}), 404
    
    duration = int(request.args.get('duration', 180))
    interval = int(request.args.get('interval', 30))
    
    propagator = SGP4Propagator(tle.line1, tle.line2)
    points = propagator.get_ground_track(datetime.utcnow(), duration, interval)
    
    return jsonify({
        'norad_id': norad_id,
        'name': tle.name,
        'ground_track': points
    })

@app.route('/api/satellite/<norad_id>/orbit', methods=['GET'])
def get_orbit_path(norad_id):
    tle = tle_manager.get_tle(norad_id)
    if not tle:
        return jsonify({'error': 'TLE not found'}), 404
    
    num_points = int(request.args.get('points', 360))
    
    propagator = SGP4Propagator(tle.line1, tle.line2)
    points = propagator.get_orbit_path(num_points)
    
    return jsonify({
        'norad_id': norad_id,
        'name': tle.name,
        'orbit_path': points
    })

@app.route('/api/satellite/<norad_id>/passes', methods=['GET'])
def predict_passes(norad_id):
    tle = tle_manager.get_tle(norad_id)
    if not tle:
        return jsonify({'error': 'TLE not found'}), 404
    
    try:
        lat = float(request.args.get('lat'))
        lon = float(request.args.get('lon'))
        alt = float(request.args.get('alt', 0))
        hours = int(request.args.get('hours', 24))
        min_elev = float(request.args.get('min_elev', 10.0))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid parameters'}), 400
    
    observer = {'latitude': lat, 'longitude': lon, 'altitude': alt}
    predictor = PassPredictor(tle.line1, tle.line2)
    passes = predictor.predict_passes(observer, duration_hours=hours, min_elevation=min_elev)
    
    return jsonify({
        'norad_id': norad_id,
        'name': tle.name,
        'observer': observer,
        'passes': passes
    })

@app.route('/api/satellite/<norad_id>/info', methods=['GET'])
def get_satellite_info(norad_id):
    tle = tle_manager.get_tle(norad_id)
    if not tle:
        return jsonify({'error': 'TLE not found'}), 404
    
    propagator = SGP4Propagator(tle.line1, tle.line2)
    sat = propagator.satellite
    
    pos = propagator.get_current_position()
    lla = None
    if pos:
        lla = propagator.eci_to_lla(pos['x'], pos['y'], pos['z'], datetime.utcnow())
    
    return jsonify({
        'norad_id': norad_id,
        'name': tle.name,
        'description': tle.description,
        'inclination': sat.inclo * 180 / 3.14159,
        'raan': sat.nodeo * 180 / 3.14159,
        'eccentricity': sat.ecco,
        'arg_perigee': sat.argpo * 180 / 3.14159,
        'mean_anomaly': sat.mo * 180 / 3.14159,
        'period': sat.period * 60,
        'current_position': lla
    })

@app.route('/api/init/sample', methods=['POST'])
def load_sample_data():
    count = tle_manager.load_sample_data()
    return jsonify({'message': f'Loaded {count} sample TLEs'})

@app.route('/api/collision/check', methods=['GET'])
def check_collision():
    norad_a = request.args.get('sat_a')
    norad_b = request.args.get('sat_b')
    hours = int(request.args.get('hours', 24))
    threshold = float(request.args.get('threshold', 5.0))
    
    if not norad_a or not norad_b:
        return jsonify({'error': 'Missing satellite IDs'}), 400
    
    tle_a = tle_manager.get_tle(norad_a)
    tle_b = tle_manager.get_tle(norad_b)
    
    if not tle_a or not tle_b:
        return jsonify({'error': 'TLE not found'}), 404
    
    prop_a = SGP4Propagator(tle_a.line1, tle_a.line2)
    prop_b = SGP4Propagator(tle_b.line1, tle_b.line2)
    
    cw = CollisionWarning(prop_a, prop_b)
    
    approaches = cw.check_approaches(duration_hours=hours, threshold_km=threshold)
    summary = cw.get_conjunction_summary(duration_hours=hours)
    
    return jsonify({
        'satellite_a': {
            'norad_id': norad_a,
            'name': tle_a.name
        },
        'satellite_b': {
            'norad_id': norad_b,
            'name': tle_b.name
        },
        'approaches': approaches,
        'summary': summary
    })

@app.route('/api/collision/distance', methods=['GET'])
def get_distance():
    norad_a = request.args.get('sat_a')
    norad_b = request.args.get('sat_b')
    time_str = request.args.get('time')
    
    if not norad_a or not norad_b:
        return jsonify({'error': 'Missing satellite IDs'}), 400
    
    tle_a = tle_manager.get_tle(norad_a)
    tle_b = tle_manager.get_tle(norad_b)
    
    if not tle_a or not tle_b:
        return jsonify({'error': 'TLE not found'}), 404
    
    if time_str:
        dt = datetime.fromisoformat(time_str)
    else:
        dt = datetime.utcnow()
    
    prop_a = SGP4Propagator(tle_a.line1, tle_a.line2)
    prop_b = SGP4Propagator(tle_b.line1, tle_b.line2)
    
    cw = CollisionWarning(prop_a, prop_b)
    distance = cw.calculate_distance(dt, tle_a.line1, tle_a.line2, tle_b.line1, tle_b.line2)
    
    return jsonify({
        'satellite_a': {'norad_id': norad_a, 'name': tle_a.name},
        'satellite_b': {'norad_id': norad_b, 'name': tle_b.name},
        'time': dt.isoformat(),
        'distance': distance
    })

@app.route('/api/constellation/<name>', methods=['GET'])
def get_constellation(name):
    constellation_map = {
        'starlink': 'STARLINK',
        'iss': 'ISS',
        'gps': 'GPS',
        'weather': 'METEOR'
    }
    
    search_term = constellation_map.get(name.lower(), name)
    tles = tle_manager.search_tles(search_term)
    
    return jsonify({
        'constellation': name,
        'count': len(tles),
        'satellites': [{
            'norad_id': t.norad_id,
            'name': t.name,
            'description': t.description
        } for t in tles]
    })

@app.route('/api/export/kml/<norad_id>', methods=['GET'])
def export_kml(norad_id):
    tle = tle_manager.get_tle(norad_id)
    if not tle:
        return jsonify({'error': 'TLE not found'}), 404
    
    duration = int(request.args.get('duration', 180))
    interval = int(request.args.get('interval', 30))
    include_orbit = request.args.get('orbit', 'false').lower() == 'true'
    
    propagator = SGP4Propagator(tle.line1, tle.line2)
    
    ground_track = propagator.get_ground_track(
        datetime.utcnow(),
        duration_minutes=duration,
        interval_seconds=interval
    )
    
    orbit_path = None
    if include_orbit:
        orbit_path = propagator.get_orbit_path(360)
    
    exporter = KMLExporter()
    kml_content = exporter.export_orbit_kml(
        tle.name,
        norad_id,
        ground_track,
        orbit_path
    )
    
    from flask import Response
    return Response(
        kml_content,
        mimetype='application/vnd.google-earth.kml+xml',
        headers={
            'Content-Disposition': f'attachment; filename="{norad_id}_orbit.kml"'
        }
    )

@app.route('/api/export/kml/multi', methods=['POST'])
def export_multi_kml():
    data = request.json
    norad_ids = data.get('satellites', [])
    
    if not norad_ids:
        return jsonify({'error': 'No satellites specified'}), 400
    
    duration = data.get('duration', 180)
    interval = data.get('interval', 30)
    
    satellites_data = []
    for norad_id in norad_ids:
        tle = tle_manager.get_tle(norad_id)
        if not tle:
            continue
        
        propagator = SGP4Propagator(tle.line1, tle.line2)
        ground_track = propagator.get_ground_track(
            datetime.utcnow(),
            duration_minutes=duration,
            interval_seconds=interval
        )
        
        satellites_data.append({
            'norad_id': norad_id,
            'name': tle.name,
            'ground_track': ground_track
        })
    
    exporter = KMLExporter()
    kml_content = exporter.export_multi_satellite_kml(satellites_data)
    
    from flask import Response
    return Response(
        kml_content,
        mimetype='application/vnd.google-earth.kml+xml',
        headers={
            'Content-Disposition': 'attachment; filename="multi_satellite_orbit.kml"'
        }
    )

def run_server():
    app.run(host='0.0.0.0', port=5000, debug=True)

if __name__ == '__main__':
    run_server()
