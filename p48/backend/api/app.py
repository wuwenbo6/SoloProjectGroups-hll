from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import numpy as np
import os
from datetime import datetime, timedelta
from pathlib import Path

from database import (
    init_db,
    insert_measurement,
    get_measurements,
    get_measurement,
    delete_measurement,
    insert_alert,
    get_alerts,
    acknowledge_alert,
    get_flow_stats,
    generate_daily_report,
    get_daily_report,
    get_daily_reports,
    export_daily_report_csv,
    get_config,
    set_config
)

from point_cloud_processor_advanced import AdvancedPointCloudProcessor
from anomaly_detector import VolumeAnomalyDetector, FlowRateCalculator

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).parent.parent.parent
UPLOAD_DIR = BASE_DIR / 'backend' / 'api' / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)
EXPORT_DIR = BASE_DIR / 'backend' / 'api' / 'exports'
EXPORT_DIR.mkdir(exist_ok=True)

init_db()

PROCESSOR_CONFIG = {
    'enable_tracking': True,
    'enable_smoothing': True,
    'smoothing_method': 'ema',
    'smoothing_window': 10,
    'ground_distance_threshold': 0.03,
    'cluster_eps': 0.05,
    'min_cluster_points': 50,
    'max_inclination_angle': 30
}

processor = AdvancedPointCloudProcessor(**PROCESSOR_CONFIG)
anomaly_detector = VolumeAnomalyDetector(history_size=50)
flow_calculator = FlowRateCalculator(material_density=float(get_config('material_density', '1.6')))


def point_cloud_to_json(cloud_path):
    try:
        import open3d as o3d
        pcd = o3d.io.read_point_cloud(str(cloud_path))
        points = np.asarray(pcd.points)
        
        if pcd.has_colors():
            colors = (np.asarray(pcd.colors) * 255).astype(np.uint8)
        else:
            colors = np.ones((len(points), 3), dtype=np.uint8) * 128
        
        data = {
            'points': points.tolist(),
            'colors': colors.tolist()
        }
        return data
    except Exception as e:
        return {'error': str(e)}


def generate_test_point_cloud(frame_id=0):
    import open3d as o3d
    
    ground_points = []
    for x in np.linspace(-2, 2, 50):
        for y in np.linspace(-2, 2, 50):
            z = 0 + np.random.normal(0, 0.02)
            ground_points.append([x, y, z])
    
    pile1_points = []
    center_x1, center_y1 = -0.8, 0.5
    height_jitter = np.sin(frame_id * 0.3) * 0.05
    
    for x in np.linspace(-1.5, -0.1, 30):
        for y in np.linspace(0, 1, 30):
            dist = np.sqrt((x - center_x1)**2 + (y - center_y1)**2)
            if dist < 0.6:
                height = (0.8 + height_jitter) * (1 - dist / 0.6)
                if height > 0:
                    z = height + np.random.normal(0, 0.03)
                    pile1_points.append([x, y, z])
    
    pile2_points = []
    center_x2, center_y2 = 0.7, -0.3
    
    for x in np.linspace(0, 1.4, 30):
        for y in np.linspace(-0.8, 0.2, 30):
            dist = np.sqrt((x - center_x2)**2 + (y - center_y2)**2)
            if dist < 0.5:
                height = 0.6 * (1 - dist / 0.5)
                if height > 0:
                    z = height + np.random.normal(0, 0.03)
                    pile2_points.append([x, y, z])
    
    all_points = ground_points + pile1_points + pile2_points
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(np.array(all_points))
    
    output_path = UPLOAD_DIR / 'test_cloud.pcd'
    o3d.io.write_point_cloud(str(output_path), pcd)
    return output_path, pcd


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now().isoformat(),
        'processor_config': PROCESSOR_CONFIG,
        'anomaly_stats': anomaly_detector.get_statistics()
    })


@app.route('/api/config', methods=['GET', 'POST'])
def config():
    global processor, PROCESSOR_CONFIG, flow_calculator
    
    if request.method == 'GET':
        return jsonify({
            'processor': PROCESSOR_CONFIG,
            'system': {
                'material_density': float(get_config('material_density', '1.6')),
                'volume_change_threshold': float(get_config('volume_change_threshold', '30.0')),
                'flow_rate_warning': float(get_config('flow_rate_warning', '100.0')),
                'flow_rate_critical': float(get_config('flow_rate_critical', '200.0')),
                'alert_cooldown': int(get_config('alert_cooldown', '60'))
            }
        })
    
    data = request.json
    
    if 'processor' in data:
        PROCESSOR_CONFIG.update(data['processor'])
        processor = AdvancedPointCloudProcessor(**PROCESSOR_CONFIG)
    
    if 'system' in data:
        for key, value in data['system'].items():
            set_config(key, value)
        
        if 'material_density' in data['system']:
            flow_calculator = FlowRateCalculator(
                material_density=float(data['system']['material_density'])
            )
    
    return jsonify({
        'status': 'updated',
        'processor': PROCESSOR_CONFIG
    })


@app.route('/api/process', methods=['POST'])
def process_point_cloud():
    try:
        import open3d as o3d
        
        if 'file' in request.files:
            file = request.files['file']
            temp_path = UPLOAD_DIR / f'temp_{datetime.now().timestamp()}.pcd'
            file.save(str(temp_path))
            pcd = o3d.io.read_point_cloud(str(temp_path))
        elif request.json and 'points' in request.json:
            points = np.array(request.json['points'])
            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(points)
        else:
            frame_id = processor.pile_tracker.frame_count if processor.pile_tracker else 0
            temp_path, pcd = generate_test_point_cloud(frame_id)
        
        result = processor.process(pcd)
        
        material_density = float(get_config('material_density', '1.6'))
        total_weight = result['total_volume'] * material_density
        flow_rate = flow_calculator.update(result['total_volume'])
        
        result['total_weight'] = total_weight
        result['flow_rate'] = flow_rate
        result['material_density'] = material_density
        
        piles_for_db = [{
            'id': p.get('track_id', p['id']),
            'track_id': p.get('track_id'),
            'volume': p['volume'],
            'raw_volume': p.get('raw_volume', p['volume']),
            'centroid_x': p['centroid_x'],
            'centroid_y': p['centroid_y'],
            'centroid_z': p['centroid_z']
        } for p in result['piles']]
        
        measurement_id = insert_measurement(
            total_volume=result['total_volume'],
            pile_count=result['total_piles'],
            pile_volumes=piles_for_db,
            point_cloud_path=str(UPLOAD_DIR / f'temp_{datetime.now().timestamp()}.pcd'),
            material_density=material_density
        )
        
        alerts = anomaly_detector.update(
            total_volume=result['total_volume'],
            flow_rate=flow_rate,
            pile_count=result['total_piles'],
            measurement_id=measurement_id
        )
        
        result['measurement_id'] = measurement_id
        result['alerts'] = len(alerts)
        result['anomaly_stats'] = anomaly_detector.get_statistics()
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500


@app.route('/api/reset-tracking', methods=['POST'])
def reset_tracking():
    processor.reset_tracking()
    anomaly_detector.reset()
    flow_calculator.reset()
    return jsonify({'status': 'tracking_reset'})


@app.route('/api/measurements', methods=['GET'])
def list_measurements():
    limit = request.args.get('limit', 100, type=int)
    measurements = get_measurements(limit)
    return jsonify(measurements)


@app.route('/api/measurements/<int:measurement_id>', methods=['GET'])
def get_single_measurement(measurement_id):
    measurement = get_measurement(measurement_id)
    if not measurement:
        return jsonify({'error': 'Measurement not found'}), 404
    return jsonify(measurement)


@app.route('/api/measurements/<int:measurement_id>', methods=['DELETE'])
def delete_single_measurement(measurement_id):
    success = delete_measurement(measurement_id)
    if not success:
        return jsonify({'error': 'Measurement not found'}), 404
    return jsonify({'status': 'deleted', 'id': measurement_id})


@app.route('/api/alerts', methods=['GET'])
def list_alerts():
    limit = request.args.get('limit', 100, type=int)
    acknowledged = request.args.get('acknowledged', type=lambda v: v.lower() == 'true')
    
    if acknowledged is None:
        acknowledged_param = None
    else:
        acknowledged_param = acknowledged
    
    alerts = get_alerts(limit=limit, acknowledged=acknowledged_param)
    return jsonify(alerts)


@app.route('/api/alerts/<int:alert_id>/acknowledge', methods=['POST'])
def ack_alert(alert_id):
    success = acknowledge_alert(alert_id)
    if not success:
        return jsonify({'error': 'Alert not found'}), 404
    return jsonify({'status': 'acknowledged', 'id': alert_id})


@app.route('/api/alerts/acknowledge-all', methods=['POST'])
def ack_all_alerts():
    alerts = get_alerts(limit=1000, acknowledged=False)
    count = 0
    for alert in alerts:
        if acknowledge_alert(alert['id']):
            count += 1
    return jsonify({'status': 'acknowledged', 'count': count})


@app.route('/api/flow-stats', methods=['GET'])
def flow_statistics():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    stats = get_flow_stats(start_date, end_date)
    return jsonify(stats)


@app.route('/api/reports/daily', methods=['GET', 'POST'])
def daily_report():
    date_str = request.args.get('date')
    if date_str:
        date = datetime.strptime(date_str, '%Y-%m-%d').date()
    else:
        date = None
    
    if request.method == 'POST':
        report = generate_daily_report(date)
        return jsonify(report)
    
    report = get_daily_report(date)
    if not report:
        report = generate_daily_report(date)
    return jsonify(report)


@app.route('/api/reports/daily/list', methods=['GET'])
def list_daily_reports():
    limit = request.args.get('limit', 30, type=int)
    reports = get_daily_reports(limit)
    return jsonify(reports)


@app.route('/api/reports/daily/export', methods=['GET'])
def export_report():
    date_str = request.args.get('date')
    if date_str:
        date = datetime.strptime(date_str, '%Y-%m-%d').date()
    else:
        date = None
    
    format_type = request.args.get('format', 'csv')
    
    try:
        if format_type == 'csv':
            output_path = export_daily_report_csv(date)
            if output_path:
                return send_file(output_path, as_attachment=True, 
                               download_name=Path(output_path).name)
        else:
            return jsonify({'error': 'Unsupported format'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'Export failed'}), 500


@app.route('/api/statistics/summary', methods=['GET'])
def statistics_summary():
    days = request.args.get('days', 7, type=int)
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)
    
    flow_stats = get_flow_stats(start_date.isoformat(), end_date.isoformat())
    
    total_volume = sum(s['total_volume'] for s in flow_stats)
    total_weight = sum(s['total_weight'] for s in flow_stats)
    avg_flow = np.mean([s['avg_flow_rate'] for s in flow_stats]) if flow_stats else 0
    peak_flow = max([s['peak_flow_rate'] for s in flow_stats]) if flow_stats else 0
    
    recent_alerts = get_alerts(limit=1000)
    unacknowledged = sum(1 for a in recent_alerts if not a['acknowledged'])
    
    return jsonify({
        'period_days': days,
        'total_volume': float(total_volume),
        'total_weight': float(total_weight),
        'avg_flow_rate': float(avg_flow),
        'peak_flow_rate': float(peak_flow),
        'measurement_count': sum(s['measurement_count'] for s in flow_stats),
        'alert_count': len(recent_alerts),
        'unacknowledged_alerts': unacknowledged
    })


@app.route('/api/test/generate', methods=['POST'])
def generate_test_data():
    import open3d as o3d
    frame_id = processor.pile_tracker.frame_count if processor.pile_tracker else 0
    _, pcd = generate_test_point_cloud(frame_id)
    
    result = processor.process(pcd)
    
    material_density = float(get_config('material_density', '1.6'))
    result['total_weight'] = result['total_volume'] * material_density
    result['flow_rate'] = flow_calculator.update(result['total_volume'])
    result['material_density'] = material_density
    
    return jsonify(result)


@app.route('/api/test/batch', methods=['POST'])
def batch_test():
    import open3d as o3d
    
    num_frames = request.json.get('frames', 20) if request.json else 20
    
    processor.reset_tracking()
    anomaly_detector.reset()
    flow_calculator.reset()
    
    results = []
    alerts_generated = []
    
    for i in range(num_frames):
        _, pcd = generate_test_point_cloud(frame_id=i)
        result = processor.process(pcd)
        
        flow_rate = flow_calculator.update(result['total_volume'])
        alerts = anomaly_detector.update(
            total_volume=result['total_volume'],
            flow_rate=flow_rate,
            pile_count=result['total_piles']
        )
        
        if alerts:
            alerts_generated.extend(alerts)
        
        results.append({
            'frame': i,
            'total_volume': result['total_volume'],
            'flow_rate': flow_rate,
            'piles': [{
                'id': p.get('track_id', p['id']),
                'volume': p['volume']
            } for p in result['piles']]
        })
    
    return jsonify({
        'frames': results,
        'alerts_count': len(alerts_generated),
        'anomaly_stats': anomaly_detector.get_statistics()
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
