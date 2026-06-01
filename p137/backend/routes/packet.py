from flask import Blueprint, request, jsonify
from services.mininet_service import mininet_service

packet_bp = Blueprint('packet', __name__)

@packet_bp.route('/api/packet/send', methods=['POST'])
def send_packet():
    data = request.get_json()
    src = data.get('src')
    dst = data.get('dst')
    packet_type = data.get('type', 'ICMP')
    
    packet_id = mininet_service.send_packet(src, dst, packet_type)
    if packet_id:
        return jsonify({'packetId': packet_id})
    return jsonify({'error': 'Simulation not running or invalid topology'}), 400

@packet_bp.route('/api/packet/<packet_id>/path', methods=['GET'])
def get_packet_path(packet_id):
    path = mininet_service.get_packet_path(packet_id)
    if path:
        return jsonify(path)
    return jsonify({'error': 'Packet not found'}), 404
