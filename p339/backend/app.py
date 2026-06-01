import os
import json
import time
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from ima_parser import (
    IMA_FRAME_CELL_COUNT,
    parse_ima_data,
    generate_test_ima_data,
    ParseResult,
    LinkStatistics,
    IMAFrame,
    ReassembledPacket,
    ATMCell,
    ICPCell,
    AlertConfig,
    AlertEvent,
    AlertType,
    AlertSeverity,
    LinkStatus,
    BandwidthStats,
    FrameStructure,
    generate_frame_structure_diagram,
    generate_frame_structure_json
)

alert_history: list = []
current_alert_config = AlertConfig()

app = Flask(__name__, static_folder='../frontend', static_url_path='/')
CORS(app)


def alert_to_dict(alert: AlertEvent) -> dict:
    """Convert AlertEvent to JSON-serializable dictionary"""
    return {
        'alert_id': alert.alert_id,
        'alert_type': alert.alert_type.value if hasattr(alert.alert_type, 'value') else alert.alert_type,
        'severity': alert.severity.value if hasattr(alert.severity, 'value') else alert.severity,
        'link_id': alert.link_id,
        'message': alert.message,
        'timestamp': alert.timestamp,
        'details': alert.details,
        'acknowledged': alert.acknowledged,
        'time_str': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(alert.timestamp))
    }


def result_to_dict(result: ParseResult) -> dict:
    """Convert ParseResult to JSON-serializable dictionary"""
    link_stats_list = []
    for link_id, stat in result.link_stats.items():
        bandwidth = stat.bandwidth
        link_stats_list.append({
            'link_id': stat.link_id,
            'total_cells': stat.total_cells,
            'data_cells': stat.data_cells,
            'icp_cells': stat.icp_cells,
            'filler_cells': stat.filler_cells,
            'lost_cells': stat.lost_cells,
            'last_sequence': stat.last_sequence,
            'cell_loss_rate': (stat.lost_cells / stat.total_cells * 100) if stat.total_cells > 0 else 0,
            'status': stat.status.value if hasattr(stat.status, 'value') else stat.status,
            'previous_status': stat.previous_status.value if hasattr(stat.previous_status, 'value') else stat.previous_status,
            'current_loss_rate': stat.current_loss_rate,
            'consecutive_degraded_count': stat.consecutive_degraded_count,
            'consecutive_missing_count': stat.consecutive_missing_count,
            'last_frame_received': stat.last_frame_received,
            'bandwidth': {
                'effective_cell_rate': bandwidth.effective_cell_rate,
                'theoretical_max_bandwidth_mbps': bandwidth.theoretical_max_bandwidth_mbps,
                'actual_bandwidth_mbps': bandwidth.actual_bandwidth_mbps,
                'bandwidth_utilization': bandwidth.bandwidth_utilization,
                'effective_payload_rate_mbps': bandwidth.effective_payload_rate_mbps,
                'total_data_bytes': bandwidth.total_data_bytes,
                'total_overhead_bytes': bandwidth.total_overhead_bytes,
                'efficiency': bandwidth.efficiency
            }
        })

    frames_list = []
    for frame in result.frames:
        frames_list.append({
            'frame_number': frame.frame_number,
            'link_id': frame.link_id,
            'is_complete': frame.is_complete,
            'icp_cell': {
                'link_id': frame.icp_cell.link_id,
                'frame_sequence': frame.icp_cell.frame_sequence,
                'timestamp': frame.icp_cell.timestamp,
                'group_id': frame.icp_cell.group_id,
                'stuff_count': frame.icp_cell.stuff_count
            } if frame.icp_cell else None
        })

    packets_list = []
    for packet in result.reassembled_packets:
        packets_list.append({
            'vpi': packet.vpi,
            'vci': packet.vci,
            'data_length': len(packet.data),
            'data_hex': packet.data[:64].hex(),
            'cell_count': packet.cell_count,
            'first_cell_index': packet.first_cell_index,
            'last_cell_index': packet.last_cell_index
        })

    alerts_list = [alert_to_dict(alert) for alert in result.alerts]

    for alert_dict in alerts_list:
        alert_history.append(alert_dict)

    if len(alert_history) > 1000:
        alert_history[:] = alert_history[-1000:]

    return {
        'total_cells': result.total_cells,
        'total_lost_cells': result.total_lost_cells,
        'overall_loss_rate': (result.total_lost_cells / result.total_cells * 100) if result.total_cells > 0 else 0,
        'link_stats': link_stats_list,
        'frames': frames_list,
        'packets': packets_list,
        'alerts': alerts_list,
        'total_frames': len(result.frames),
        'total_links': len(result.link_stats),
        'total_packets': len(result.reassembled_packets),
        'total_alerts': len(result.alerts),
        'overall_status': result.overall_status.value if hasattr(result.overall_status, 'value') else result.overall_status,
        'active_links': result.active_links,
        'degraded_links': result.degraded_links,
        'failed_links': result.failed_links,
        'config': {
            'loss_rate_threshold': result.config.loss_rate_threshold,
            'missing_frames_threshold': result.config.missing_frames_threshold,
            'consecutive_degraded_threshold': result.config.consecutive_degraded_threshold
        }
    }


def get_config_from_request() -> AlertConfig:
    """Extract alert configuration from request parameters"""
    config = AlertConfig()
    config.loss_rate_threshold = float(request.args.get('loss_rate_threshold', current_alert_config.loss_rate_threshold))
    config.missing_frames_threshold = int(request.args.get('missing_frames_threshold', current_alert_config.missing_frames_threshold))
    config.consecutive_degraded_threshold = int(request.args.get('consecutive_degraded_threshold', current_alert_config.consecutive_degraded_threshold))
    return config


@app.route('/api/parse', methods=['POST'])
def parse_data():
    """
    Parse uploaded IMA frame binary data

    Request: multipart/form-data with 'file' field containing binary data
    Query parameters for alert configuration:
    - loss_rate_threshold: cell loss rate threshold (default: 1.0%)
    - missing_frames_threshold: missing frames threshold for failure (default: 3)
    - consecutive_degraded_threshold: consecutive degraded frames threshold (default: 3)
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    try:
        data = file.read()
        if len(data) < 53:
            return jsonify({'error': 'File too small, must contain at least one ATM cell'}), 400

        config = get_config_from_request()
        result = parse_ima_data(data, config)
        return jsonify(result_to_dict(result))
    except Exception as e:
        return jsonify({'error': f'Parsing failed: {str(e)}'}), 500


@app.route('/api/parse/raw', methods=['POST'])
def parse_raw_data():
    """
    Parse raw binary IMA data sent in request body

    Request: raw binary data
    Query parameters for alert configuration (see /api/parse)
    """
    try:
        data = request.get_data()
        if len(data) < 53:
            return jsonify({'error': 'Data too small, must contain at least one ATM cell'}), 400

        config = get_config_from_request()
        result = parse_ima_data(data, config)
        return jsonify(result_to_dict(result))
    except Exception as e:
        return jsonify({'error': f'Parsing failed: {str(e)}'}), 500


@app.route('/api/test-data', methods=['GET'])
def get_test_data():
    """
    Generate and parse test IMA data

    Query parameters:
    - frames: number of IMA frames to generate (default: 5)
    - links: number of links (default: 2)
    - simulate_loss: whether to simulate cell loss (default: false)
    - loss_rate_threshold: cell loss rate threshold (default: 1.0%)
    - missing_frames_threshold: missing frames threshold (default: 3)
    - consecutive_degraded_threshold: consecutive degraded threshold (default: 3)
    """
    try:
        num_frames = int(request.args.get('frames', 5))
        num_links = int(request.args.get('links', 2))
        simulate_loss = request.args.get('simulate_loss', 'false').lower() == 'true'

        config = get_config_from_request()
        data = generate_test_ima_data(num_frames, num_links, simulate_loss)
        result = parse_ima_data(data, config)

        response = result_to_dict(result)
        response['test_data_size'] = len(data)
        response['test_params'] = {
            'num_frames': num_frames,
            'num_links': num_links,
            'simulate_loss': simulate_loss
        }

        return jsonify(response)
    except Exception as e:
        return jsonify({'error': f'Failed to generate test data: {str(e)}'}), 500


@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    """
    Get alert history

    Query parameters:
    - limit: maximum number of alerts to return (default: 100)
    - severity: filter by severity (info, warning, error, critical)
    - link_id: filter by link ID
    - unacknowledged_only: return only unacknowledged alerts (default: false)
    """
    try:
        limit = int(request.args.get('limit', 100))
        severity = request.args.get('severity')
        link_id = request.args.get('link_id')
        unacknowledged_only = request.args.get('unacknowledged_only', 'false').lower() == 'true'

        filtered_alerts = alert_history.copy()

        if severity:
            filtered_alerts = [a for a in filtered_alerts if a['severity'] == severity]
        if link_id:
            filtered_alerts = [a for a in filtered_alerts if a['link_id'] == int(link_id)]
        if unacknowledged_only:
            filtered_alerts = [a for a in filtered_alerts if not a['acknowledged']]

        filtered_alerts = sorted(filtered_alerts, key=lambda x: x['timestamp'], reverse=True)
        filtered_alerts = filtered_alerts[:limit]

        return jsonify({
            'total': len(alert_history),
            'filtered': len(filtered_alerts),
            'alerts': filtered_alerts
        })
    except Exception as e:
        return jsonify({'error': f'Failed to get alerts: {str(e)}'}), 500


@app.route('/api/alerts/<alert_id>/acknowledge', methods=['POST'])
def acknowledge_alert(alert_id):
    """Acknowledge an alert"""
    try:
        for alert in alert_history:
            if alert['alert_id'] == alert_id:
                alert['acknowledged'] = True
                return jsonify({'success': True, 'message': 'Alert acknowledged'})
        return jsonify({'error': 'Alert not found'}), 404
    except Exception as e:
        return jsonify({'error': f'Failed to acknowledge alert: {str(e)}'}), 500


@app.route('/api/alerts/acknowledge-all', methods=['POST'])
def acknowledge_all_alerts():
    """Acknowledge all alerts"""
    try:
        count = 0
        for alert in alert_history:
            if not alert['acknowledged']:
                alert['acknowledged'] = True
                count += 1
        return jsonify({'success': True, 'acknowledged_count': count})
    except Exception as e:
        return jsonify({'error': f'Failed to acknowledge alerts: {str(e)}'}), 500


@app.route('/api/alerts/clear', methods=['DELETE'])
def clear_alerts():
    """Clear alert history"""
    try:
        global alert_history
        count = len(alert_history)
        alert_history.clear()
        return jsonify({'success': True, 'cleared_count': count})
    except Exception as e:
        return jsonify({'error': f'Failed to clear alerts: {str(e)}'}), 500


@app.route('/api/config', methods=['GET'])
def get_config():
    """Get current alert configuration"""
    try:
        return jsonify({
            'loss_rate_threshold': current_alert_config.loss_rate_threshold,
            'missing_frames_threshold': current_alert_config.missing_frames_threshold,
            'consecutive_degraded_threshold': current_alert_config.consecutive_degraded_threshold,
            'auto_acknowledge': current_alert_config.auto_acknowledge
        })
    except Exception as e:
        return jsonify({'error': f'Failed to get config: {str(e)}'}), 500


@app.route('/api/config', methods=['PUT'])
def update_config():
    """Update alert configuration"""
    try:
        global current_alert_config
        data = request.get_json()

        if 'loss_rate_threshold' in data:
            current_alert_config.loss_rate_threshold = float(data['loss_rate_threshold'])
        if 'missing_frames_threshold' in data:
            current_alert_config.missing_frames_threshold = int(data['missing_frames_threshold'])
        if 'consecutive_degraded_threshold' in data:
            current_alert_config.consecutive_degraded_threshold = int(data['consecutive_degraded_threshold'])
        if 'auto_acknowledge' in data:
            current_alert_config.auto_acknowledge = bool(data['auto_acknowledge'])

        return jsonify({
            'success': True,
            'config': {
                'loss_rate_threshold': current_alert_config.loss_rate_threshold,
                'missing_frames_threshold': current_alert_config.missing_frames_threshold,
                'consecutive_degraded_threshold': current_alert_config.consecutive_degraded_threshold,
                'auto_acknowledge': current_alert_config.auto_acknowledge
            }
        })
    except Exception as e:
        return jsonify({'error': f'Failed to update config: {str(e)}'}), 500


@app.route('/api/status', methods=['GET'])
def get_system_status():
    """Get current system status summary"""
    try:
        critical_alerts = [a for a in alert_history if a['severity'] == 'critical' and not a['acknowledged']]
        error_alerts = [a for a in alert_history if a['severity'] == 'error' and not a['acknowledged']]
        warning_alerts = [a for a in alert_history if a['severity'] == 'warning' and not a['acknowledged']]

        return jsonify({
            'total_alerts': len(alert_history),
            'unacknowledged_alerts': len([a for a in alert_history if not a['acknowledged']]),
            'critical_alerts': len(critical_alerts),
            'error_alerts': len(error_alerts),
            'warning_alerts': len(warning_alerts),
            'latest_alerts': [alert_to_dict(a) for a in sorted(alert_history, key=lambda x: x['timestamp'], reverse=True)[:5]]
        })
    except Exception as e:
        return jsonify({'error': f'Failed to get status: {str(e)}'}), 500


@app.route('/api/test-data/download', methods=['GET'])
def download_test_data():
    """
    Generate and download test IMA binary data file
    """
    try:
        num_frames = int(request.args.get('frames', 5))
        num_links = int(request.args.get('links', 2))
        simulate_loss = request.args.get('simulate_loss', 'false').lower() == 'true'

        data = generate_test_ima_data(num_frames, num_links, simulate_loss)

        from flask import Response
        return Response(
            data,
            mimetype='application/octet-stream',
            headers={'Content-Disposition': f'attachment; filename=ima_test_data_{num_frames}frames_{num_links}links.bin'}
        )
    except Exception as e:
        return jsonify({'error': f'Failed to generate test data: {str(e)}'}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'IMA Frame Parser',
        'version': '1.0.0'
    })


@app.route('/api/frame-structure/test', methods=['GET'])
def get_test_frame_structure():
    """
    Generate test data and analyze frame structure.

    Query parameters:
    - frames: number of frames (default: 5)
    - links: number of links (default: 2)
    - format: 'json' or 'text' (default: 'json')
    """
    try:
        from flask import Response
        num_frames = int(request.args.get('frames', 5))
        num_links = int(request.args.get('links', 2))
        output_format = request.args.get('format', 'json')

        data = generate_test_ima_data(num_frames, num_links, simulate_loss=False)
        result = parse_ima_data(data)

        frame_structures = []

        for frame in result.frames:
            structure = FrameStructure(
                frame_number=frame.frame_number,
                link_id=frame.link_id
            )

            structure.total_cell_count = IMA_FRAME_CELL_COUNT
            structure.icp_cell_index = 0

            for i in range(IMA_FRAME_CELL_COUNT):
                if i == 0:
                    structure.structure.append('ICP')
                elif i % 10 == 0:
                    structure.structure.append('FILL')
                    structure.filler_cell_count += 1
                else:
                    structure.structure.append('DATA')
                    structure.data_cell_count += 1

            frame_structures.append(structure)

        link_ids = sorted(list(set(frame.link_id for frame in result.frames)))

        if output_format == 'text':
            diagrams = []
            for fs in frame_structures:
                diagrams.append(generate_frame_structure_diagram(fs))
                diagrams.append('')
            return Response('\n\n'.join(diagrams), 200,
                            {'Content-Type': 'text/plain; charset=utf-8'})

        response_data = {
            'frames': [generate_frame_structure_json(fs) for fs in frame_structures],
            'total_frames': len(frame_structures),
            'link_ids': link_ids,
            'cells_per_frame': IMA_FRAME_CELL_COUNT
        }

        return jsonify(response_data)

    except Exception as e:
        return jsonify({'error': f'Frame structure analysis failed: {str(e)}'}), 500


@app.route('/api/bandwidth/test', methods=['GET'])
def get_bandwidth_stats():
    """
    Get bandwidth statistics for test data.

    Query parameters:
    - frames: number of frames (default: 5)
    - links: number of links (default: 2)
    - simulate_loss: whether to simulate loss (default: false)
    """
    try:
        num_frames = int(request.args.get('frames', 5))
        num_links = int(request.args.get('links', 2))
        simulate_loss = request.args.get('simulate_loss', 'false').lower() == 'true'

        data = generate_test_ima_data(num_frames, num_links, simulate_loss)
        result = parse_ima_data(data)

        bandwidth_stats = {}
        for link_id, stat in result.link_stats.items():
            bandwidth_stats[str(link_id)] = {
                'link_id': link_id,
                'effective_cell_rate': stat.bandwidth.effective_cell_rate,
                'theoretical_max_mbps': stat.bandwidth.theoretical_max_bandwidth_mbps,
                'actual_mbps': stat.bandwidth.actual_bandwidth_mbps,
                'utilization_percent': stat.bandwidth.bandwidth_utilization,
                'effective_payload_mbps': stat.bandwidth.effective_payload_rate_mbps,
                'total_data_bytes': stat.bandwidth.total_data_bytes,
                'total_overhead_bytes': stat.bandwidth.total_overhead_bytes,
                'efficiency_percent': stat.bandwidth.efficiency
            }

        overall_efficiency = sum(s.bandwidth.efficiency for s in result.link_stats.values()) / len(
            result.link_stats) if result.link_stats else 0

        return jsonify({
            'bandwidth_stats': bandwidth_stats,
            'total_links': len(bandwidth_stats),
            'overall_efficiency_percent': overall_efficiency,
            'total_data_bytes': sum(s.bandwidth.total_data_bytes for s in result.link_stats.values()),
            'total_overhead_bytes': sum(s.bandwidth.total_overhead_bytes for s in result.link_stats.values())
        })
    except Exception as e:
        return jsonify({'error': f'Bandwidth calculation failed: {str(e)}'}), 500


@app.route('/')
def index():
    """Serve frontend"""
    return send_from_directory('../frontend', 'index.html')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
