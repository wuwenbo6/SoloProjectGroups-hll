from flask import Blueprint, request, jsonify
from services.mininet_service import mininet_service

flowtable_bp = Blueprint('flowtable', __name__)

@flowtable_bp.route('/api/flowrules', methods=['POST'])
def add_flow_rule():
    data = request.get_json()
    rule = mininet_service.add_flow_rule(data)
    return jsonify(rule), 201

@flowtable_bp.route('/api/flowrules/<switch_id>', methods=['GET'])
def get_flow_rules(switch_id):
    rules = mininet_service.get_flow_rules(switch_id)
    return jsonify(rules)

@flowtable_bp.route('/api/flowrules/<rule_id>', methods=['DELETE'])
def delete_flow_rule(rule_id):
    success = mininet_service.delete_flow_rule(rule_id)
    if success:
        return '', 204
    return jsonify({'error': 'Rule not found'}), 404
