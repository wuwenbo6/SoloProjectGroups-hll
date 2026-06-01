from flask import Blueprint, request, jsonify
from services.mininet_service import mininet_service

meter_bp = Blueprint('meter', __name__)

@meter_bp.route('/api/meters', methods=['POST'])
def add_meter():
    data = request.get_json()
    meter = mininet_service.add_meter(data)
    return jsonify(meter), 201

@meter_bp.route('/api/meters/<switch_id>', methods=['GET'])
def get_meters(switch_id):
    meters = mininet_service.get_meters(switch_id)
    return jsonify(meters)

@meter_bp.route('/api/meters', methods=['GET'])
def get_all_meters():
    meters = mininet_service.get_meters()
    return jsonify(meters)

@meter_bp.route('/api/meters/<meter_id>', methods=['DELETE'])
def delete_meter(meter_id):
    success = mininet_service.delete_meter(meter_id)
    if success:
        return '', 204
    return jsonify({'error': 'Meter not found'}), 404
