import os
import logging
from flask import Blueprint, request, jsonify, current_app
from datetime import datetime

from .. import db
from ..models.watershed import Watershed, Subbasin
from ..utils.swat_runner import SWATRunner

bp = Blueprint('watershed', __name__)
logger = logging.getLogger(__name__)

@bp.route('/', methods=['GET'])
def get_watersheds():
    watersheds = Watershed.query.all()
    return jsonify([w.to_dict() for w in watersheds])

@bp.route('/<int:watershed_id>', methods=['GET'])
def get_watershed(watershed_id):
    watershed = Watershed.query.get_or_404(watershed_id)
    return jsonify(watershed.to_dict())

@bp.route('/', methods=['POST'])
def create_watershed():
    data = request.get_json()
    
    watershed = Watershed(
        name=data.get('name', 'Unnamed Watershed'),
        description=data.get('description', ''),
        project_path=data.get('project_path', ''),
        area=data.get('area')
    )
    
    db.session.add(watershed)
    db.session.flush()
    
    subbasins_data = data.get('subbasins', [])
    if not subbasins_data and watershed.project_path:
        try:
            runner = SWATRunner(watershed.project_path)
            subbasins_data = runner.get_subbasin_geometries()
        except Exception as e:
            logger.warning(f"Failed to load subbasins from project: {e}")
    
    for sb_data in subbasins_data:
        subbasin = Subbasin(
            watershed_id=watershed.id,
            subbasin_number=sb_data.get('subbasin_number'),
            name=sb_data.get('name', f'Subbasin {sb_data.get("subbasin_number")}'),
            area=sb_data.get('area'),
            geometry=sb_data.get('geometry'),
            centroid_lat=sb_data.get('centroid_lat'),
            centroid_lon=sb_data.get('centroid_lon')
        )
        db.session.add(subbasin)
    
    db.session.commit()
    
    return jsonify(watershed.to_dict()), 201

@bp.route('/<int:watershed_id>', methods=['PUT'])
def update_watershed(watershed_id):
    watershed = Watershed.query.get_or_404(watershed_id)
    data = request.get_json()
    
    watershed.name = data.get('name', watershed.name)
    watershed.description = data.get('description', watershed.description)
    watershed.project_path = data.get('project_path', watershed.project_path)
    watershed.area = data.get('area', watershed.area)
    watershed.updated_at = datetime.utcnow()
    
    db.session.commit()
    
    return jsonify(watershed.to_dict())

@bp.route('/<int:watershed_id>', methods=['DELETE'])
def delete_watershed(watershed_id):
    watershed = Watershed.query.get_or_404(watershed_id)
    db.session.delete(watershed)
    db.session.commit()
    
    return jsonify({'message': 'Watershed deleted successfully'})

@bp.route('/<int:watershed_id>/subbasins', methods=['GET'])
def get_subbasins(watershed_id):
    watershed = Watershed.query.get_or_404(watershed_id)
    return jsonify([sb.to_dict() for sb in watershed.subbasins])

@bp.route('/<int:watershed_id>/subbasins/<int:subbasin_id>', methods=['GET'])
def get_subbasin(watershed_id, subbasin_id):
    subbasin = Subbasin.query.get_or_404(subbasin_id)
    if subbasin.watershed_id != watershed_id:
        return jsonify({'error': 'Subbasin does not belong to watershed'}), 400
    return jsonify(subbasin.to_dict())

@bp.route('/parameters', methods=['GET'])
def get_available_parameters():
    project_path = request.args.get('project_path', '')
    try:
        runner = SWATRunner(project_path)
        parameters = runner.get_available_parameters()
        return jsonify(parameters)
    except Exception as e:
        logger.error(f"Failed to get parameters: {e}")
        return jsonify({'error': str(e)}), 500
