from flask import Blueprint, request, jsonify, send_file, url_for
import io
import numpy as np
import base64

from services.dicom_reader import DicomReader
from services.volume_processor import VolumeProcessor
from services.surface_recon import SurfaceReconstructionService

export_bp = Blueprint('export', __name__)

dicom_reader = DicomReader()
volume_processor = VolumeProcessor()
surface_recon_service = SurfaceReconstructionService()


@export_bp.route('/image', methods=['POST'])
def export_image():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        image_data = data.get('imageData')
        session_id = data.get('sessionId', 'unknown')

        if not image_data:
            return jsonify({'error': 'No image data provided'}), 400

        if image_data.startswith('data:image/png;base64,'):
            image_data = image_data[len('data:image/png;base64,'):]

        try:
            img_bytes = base64.b64decode(image_data)
        except Exception as e:
            return jsonify({'error': f'Invalid base64 data: {str(e)}'}), 400

        from PIL import Image
        img = Image.open(io.BytesIO(img_bytes))

        import uuid
        filename = f"render_{session_id}_{uuid.uuid4().hex[:12]}.png"
        filepath = volume_processor.get_export_path(filename)
        img.save(filepath, format='PNG')

        return jsonify({
            'success': True,
            'filename': filename,
            'url': f'/api/export/download/{filename}'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@export_bp.route('/slice', methods=['POST'])
def export_slice():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        session_id = data.get('sessionId')
        plane = data.get('plane')
        index = data.get('index')
        window_width = data.get('windowWidth')
        window_level = data.get('windowLevel')

        if not session_id or not plane or index is None:
            return jsonify({'error': 'Missing required parameters'}), 400

        if not dicom_reader.has_session(session_id):
            return jsonify({'error': 'Session not found'}), 404

        volume = dicom_reader.get_volume(session_id)
        meta = dicom_reader.get_meta(session_id)

        if volume is None or meta is None:
            return jsonify({'error': 'Failed to load volume data'}), 500

        filename = volume_processor.export_slice_from_volume(
            volume, meta, plane, index, window_width, window_level
        )

        if not filename:
            return jsonify({'error': 'Failed to export slice'}), 500

        return jsonify({
            'success': True,
            'filename': filename,
            'url': f'/api/export/download/{filename}'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@export_bp.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    try:
        filepath = volume_processor.get_export_path(filename)

        import os
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404

        if filename.endswith('.stl'):
            mimetype = 'application/vnd.ms-pki.stl'
        elif filename.endswith('.ply'):
            mimetype = 'application/x-ply'
        else:
            mimetype = 'image/png'

        return send_file(
            filepath,
            mimetype=mimetype,
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@export_bp.route('/screenshot', methods=['POST'])
def save_screenshot():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        rgb_data = data.get('rgbData')
        width = data.get('width')
        height = data.get('height')
        prefix = data.get('prefix', 'screenshot')

        if not rgb_data or not width or not height:
            return jsonify({'error': 'Missing required parameters'}), 400

        rgb_array = np.array(rgb_data, dtype=np.uint8)
        if rgb_array.size != width * height * 3:
            return jsonify({'error': 'Invalid RGB data dimensions'}), 400

        rgb_array = rgb_array.reshape((height, width, 3))

        filename = volume_processor.export_rgb_image(rgb_array, prefix)

        return jsonify({
            'success': True,
            'filename': filename,
            'url': f'/api/export/download/{filename}'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@export_bp.route('/files', methods=['GET'])
def list_files():
    try:
        import os
        export_dir = volume_processor.export_dir

        files = []
        if os.path.exists(export_dir):
            for filename in os.listdir(export_dir):
                filepath = os.path.join(export_dir, filename)
                if os.path.isfile(filepath):
                    stat = os.stat(filepath)
                    files.append({
                        'filename': filename,
                        'size': stat.st_size,
                        'modified': stat.st_mtime,
                        'url': f'/api/export/download/{filename}'
                    })

        files.sort(key=lambda x: x['modified'], reverse=True)

        return jsonify({
            'success': True,
            'files': files
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@export_bp.route('/cleanup', methods=['POST'])
def cleanup_files():
    try:
        data = request.get_json() or {}
        max_age_hours = data.get('maxAgeHours', 24)

        volume_processor.cleanup_old_exports(max_age_hours)

        return jsonify({
            'success': True,
            'message': f'Cleaned up files older than {max_age_hours} hours'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@export_bp.route('/stl', methods=['POST'])
def export_stl():
    try:
        data = request.get_json() or {}
        session_id = data.get('sessionId')
        threshold = data.get('threshold')
        smooth = data.get('smooth', True)
        simplify = data.get('simplify', True)
        format_type = data.get('format', 'stl')

        if not session_id:
            return jsonify({'error': 'sessionId is required'}), 400

        if not dicom_reader.has_session(session_id):
            return jsonify({'error': 'Session not found'}), 404

        volume = dicom_reader.get_volume(session_id)
        meta = dicom_reader.get_meta(session_id)

        if volume is None or meta is None:
            return jsonify({'error': 'Failed to load volume data'}), 500

        result = surface_recon_service.reconstruct_and_export(
            volume, meta,
            threshold=threshold,
            smooth=smooth,
            simplify=simplify,
            format=format_type
        )

        return jsonify({
            'success': True,
            'filename': result['filename'],
            'url': f'/api/export/download/{result["filename"]}',
            'numVertices': result['num_vertices'],
            'numFaces': result['num_faces'],
            'fileSize': result['file_size']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@export_bp.route('/mesh-preview', methods=['POST'])
def get_mesh_preview():
    try:
        data = request.get_json() or {}
        session_id = data.get('sessionId')
        threshold = data.get('threshold')

        if not session_id:
            return jsonify({'error': 'sessionId is required'}), 400

        if not dicom_reader.has_session(session_id):
            return jsonify({'error': 'Session not found'}), 404

        volume = dicom_reader.get_volume(session_id)
        meta = dicom_reader.get_meta(session_id)

        if volume is None or meta is None:
            return jsonify({'error': 'Failed to load volume data'}), 500

        verts, faces = surface_recon_service.marching_cubes(
            volume, meta, threshold=threshold, step_size=2
        )

        info = surface_recon_service.get_mesh_info(verts, faces)

        return jsonify({
            'success': True,
            'numVertices': info['num_vertices'],
            'numFaces': info['num_faces'],
            'volume': info['volume'],
            'surfaceArea': info['surface_area'],
            'bbox': info['bbox']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@export_bp.route('/multi-stl', methods=['POST'])
def export_multi_stl():
    try:
        data = request.get_json() or {}
        session_id = data.get('sessionId')
        thresholds = data.get('thresholds', [100, 200, 300, 400, 500])
        format_type = data.get('format', 'stl')

        if not session_id:
            return jsonify({'error': 'sessionId is required'}), 400

        if not dicom_reader.has_session(session_id):
            return jsonify({'error': 'Session not found'}), 404

        volume = dicom_reader.get_volume(session_id)
        meta = dicom_reader.get_meta(session_id)

        if volume is None or meta is None:
            return jsonify({'error': 'Failed to load volume data'}), 500

        result = surface_recon_service.multi_threshold_reconstruction(
            volume, meta, thresholds, format=format_type
        )

        return jsonify({
            'success': True,
            'surfaces': result['surfaces']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
