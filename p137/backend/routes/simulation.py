from flask import Blueprint, request, jsonify
from services.mininet_service import mininet_service
from services.topology_service import TopologyService

simulation_bp = Blueprint('simulation', __name__)

@simulation_bp.route('/api/simulation/start', methods=['POST'])
def start_simulation():
    data = request.get_json()
    topology_id = data.get('topologyId')
    if topology_id:
        topology = TopologyService.get_topology(topology_id)
        if not topology:
            return jsonify({'error': 'Topology not found'}), 404
    else:
        topology = data.get('topology', {'nodes': [], 'links': []})
    
    result = mininet_service.start_simulation(topology)
    return jsonify(result)

@simulation_bp.route('/api/simulation/stop', methods=['POST'])
def stop_simulation():
    result = mininet_service.stop_simulation()
    return jsonify(result)

@simulation_bp.route('/api/simulation/status', methods=['GET'])
def get_status():
    status = mininet_service.get_status()
    return jsonify(status)

@simulation_bp.route('/api/simulation/stats', methods=['GET'])
def get_detailed_stats():
    stats = mininet_service.get_detailed_stats()
    return jsonify(stats)

@simulation_bp.route('/api/simulation/commit-pending', methods=['POST'])
def commit_pending_rules():
    committed = mininet_service.commit_pending_rules()
    return jsonify({'committed': len(committed), 'rules': committed})

@simulation_bp.route('/api/simulation/pending-rules', methods=['GET'])
def get_pending_rules():
    switch_id = request.args.get('switch_id')
    rules = mininet_service.get_pending_rules(switch_id)
    return jsonify(rules)
