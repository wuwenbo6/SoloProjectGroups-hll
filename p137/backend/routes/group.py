from flask import Blueprint, request, jsonify
from services.mininet_service import mininet_service

group_bp = Blueprint('group', __name__)

@group_bp.route('/api/groups', methods=['POST'])
def add_group():
    data = request.get_json()
    group = mininet_service.add_group(data)
    return jsonify(group), 201

@group_bp.route('/api/groups/<switch_id>', methods=['GET'])
def get_groups(switch_id):
    groups = mininet_service.get_groups(switch_id)
    return jsonify(groups)

@group_bp.route('/api/groups', methods=['GET'])
def get_all_groups():
    groups = mininet_service.get_groups()
    return jsonify(groups)

@group_bp.route('/api/groups/<group_id>', methods=['DELETE'])
def delete_group(group_id):
    success = mininet_service.delete_group(group_id)
    if success:
        return '', 204
    return jsonify({'error': 'Group not found'}), 404
