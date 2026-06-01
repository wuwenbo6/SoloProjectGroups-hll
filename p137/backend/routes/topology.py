from flask import Blueprint, request, jsonify
from services.topology_service import TopologyService

topology_bp = Blueprint('topology', __name__)

@topology_bp.route('/api/topologies', methods=['GET'])
def get_topologies():
    topologies = TopologyService.get_all_topologies()
    return jsonify(topologies)

@topology_bp.route('/api/topologies/<int:topology_id>', methods=['GET'])
def get_topology(topology_id):
    topology = TopologyService.get_topology(topology_id)
    if topology:
        return jsonify(topology)
    return jsonify({'error': 'Topology not found'}), 404

@topology_bp.route('/api/topologies', methods=['POST'])
def create_topology():
    data = request.get_json()
    name = data.get('name', 'Untitled Topology')
    nodes = data.get('nodes', [])
    links = data.get('links', [])
    topology = TopologyService.create_topology(name, nodes, links)
    return jsonify(topology), 201

@topology_bp.route('/api/topologies/<int:topology_id>', methods=['PUT'])
def update_topology(topology_id):
    data = request.get_json()
    nodes = data.get('nodes', [])
    links = data.get('links', [])
    topology = TopologyService.update_topology(topology_id, nodes, links)
    if topology:
        return jsonify(topology)
    return jsonify({'error': 'Topology not found'}), 404

@topology_bp.route('/api/topologies/<int:topology_id>', methods=['DELETE'])
def delete_topology(topology_id):
    success = TopologyService.delete_topology(topology_id)
    if success:
        return '', 204
    return jsonify({'error': 'Topology not found'}), 404
