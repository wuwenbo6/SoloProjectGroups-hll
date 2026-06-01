from flask import Blueprint, request, jsonify, Response
from services.mininet_service import mininet_service

stats_bp = Blueprint('stats', __name__)

@stats_bp.route('/api/stats/traffic', methods=['GET'])
def get_traffic_stats():
    switch_id = request.args.get('switch_id')
    port = request.args.get('port', type=int)
    
    stats = mininet_service.get_traffic_stats(switch_id, port)
    return jsonify(stats)

@stats_bp.route('/api/stats/traffic/export', methods=['GET'])
def export_traffic_stats():
    format = request.args.get('format', 'json')
    
    data, content_type = mininet_service.export_traffic_stats(format)
    
    if format == 'csv':
        return Response(
            data,
            mimetype=content_type,
            headers={'Content-Disposition': 'attachment; filename=traffic_stats.csv'}
        )
    
    return jsonify(data)

@stats_bp.route('/api/stats/traffic/reset', methods=['POST'])
def reset_traffic_stats():
    mininet_service.reset_traffic_stats()
    return jsonify({'status': 'success', 'message': 'Traffic stats reset'})
