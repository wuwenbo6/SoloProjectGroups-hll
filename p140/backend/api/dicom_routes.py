from flask import Blueprint, request, jsonify, send_file, Response
import io
import numpy as np
import base64

from services.dicom_reader import DicomReader
from services.reconstruction import ReconstructionService
from services.volume_processor import VolumeProcessor
from services.curve_recon import CurveReconstructionService
from services.fusion_service import FusionService

dicom_bp = Blueprint('dicom', __name__)

dicom_reader = DicomReader()
recon_service = ReconstructionService()
volume_processor = VolumeProcessor()
curve_recon_service = CurveReconstructionService()
fusion_service = FusionService()


@dicom_bp.route('/upload', methods=['POST'])
def upload_dicom():
    try:
        files = request.files.getlist('files')
        if not files:
            return jsonify({'error': 'No files uploaded'}), 400

        session_id, meta = dicom_reader.upload_files(files)

        return jsonify({
            'sessionId': session_id,
            'meta': meta
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/<session_id>/meta', methods=['GET'])
def get_meta(session_id):
    try:
        if not dicom_reader.has_session(session_id):
            return jsonify({'error': 'Session not found'}), 404

        meta = dicom_reader.get_meta(session_id)
        return jsonify(meta)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/<session_id>/volume', methods=['GET'])
def get_volume(session_id):
    try:
        if not dicom_reader.has_session(session_id):
            return jsonify({'error': 'Session not found'}), 404

        volume = dicom_reader.get_volume(session_id)
        meta = dicom_reader.get_meta(session_id)

        if volume is None or meta is None:
            return jsonify({'error': 'Failed to load volume data'}), 500

        window_width = request.args.get('windowWidth', type=float)
        window_level = request.args.get('windowLevel', type=float)

        if window_width is not None and window_level is not None:
            normalized_volume = recon_service.apply_window_to_volume(
                volume, meta, window_width, window_level
            )
        else:
            normalized_volume = recon_service.normalize_volume_for_texture(
                volume, meta
            )

        binary_data = volume_processor.volume_to_binary(normalized_volume, meta)

        return Response(
            binary_data,
            mimetype='application/octet-stream',
            headers={
                'Content-Disposition': f'attachment; filename=volume_{session_id}.bin',
                'Content-Length': str(len(binary_data))
            }
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/<session_id>/mpr', methods=['GET'])
def get_mpr(session_id):
    try:
        if not dicom_reader.has_session(session_id):
            return jsonify({'error': 'Session not found'}), 404

        volume = dicom_reader.get_volume(session_id)
        meta = dicom_reader.get_meta(session_id)

        if volume is None or meta is None:
            return jsonify({'error': 'Failed to load volume data'}), 500

        axial_idx = request.args.get('axial', type=int)
        sagittal_idx = request.args.get('sagittal', type=int)
        coronal_idx = request.args.get('coronal', type=int)
        window_width = request.args.get('windowWidth', type=float)
        window_level = request.args.get('windowLevel', type=float)

        mpr_data = recon_service.get_multi_planar_reconstruction(
            volume, meta,
            axial_idx=axial_idx,
            sagittal_idx=sagittal_idx,
            coronal_idx=coronal_idx,
            window_width=window_width,
            window_level=window_level
        )

        import base64
        response = {
            'axial': {
                'data': base64.b64encode(mpr_data['axial']['data']).decode('ascii'),
                'width': mpr_data['axial']['width'],
                'height': mpr_data['axial']['height'],
                'index': mpr_data['axial']['index']
            },
            'sagittal': {
                'data': base64.b64encode(mpr_data['sagittal']['data']).decode('ascii'),
                'width': mpr_data['sagittal']['width'],
                'height': mpr_data['sagittal']['height'],
                'index': mpr_data['sagittal']['index']
            },
            'coronal': {
                'data': base64.b64encode(mpr_data['coronal']['data']).decode('ascii'),
                'width': mpr_data['coronal']['width'],
                'height': mpr_data['coronal']['height'],
                'index': mpr_data['coronal']['index']
            }
        }

        return jsonify(response)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/<session_id>/slice/<plane>/<int:index>', methods=['GET'])
def get_slice(session_id, plane, index):
    try:
        if not dicom_reader.has_session(session_id):
            return jsonify({'error': 'Session not found'}), 404

        volume = dicom_reader.get_volume(session_id)
        meta = dicom_reader.get_meta(session_id)

        if volume is None or meta is None:
            return jsonify({'error': 'Failed to load volume data'}), 500

        window_width = request.args.get('windowWidth', type=float)
        window_level = request.args.get('windowLevel', type=float)

        if plane == 'axial':
            slice_data = recon_service.get_axial_slice(
                volume, index, window_width, window_level
            )
        elif plane == 'sagittal':
            slice_data = recon_service.get_sagittal_slice(
                volume, meta, index, window_width, window_level
            )
        elif plane == 'coronal':
            slice_data = recon_service.get_coronal_slice(
                volume, meta, index, window_width, window_level
            )
        else:
            return jsonify({'error': f'Unknown plane: {plane}'}), 400

        if window_width is not None and window_level is not None:
            min_val = window_level - window_width / 2
            max_val = window_level + window_width / 2
        else:
            min_val = np.min(slice_data)
            max_val = np.max(slice_data)

        normalized = (slice_data - min_val) / (max_val - min_val + 1e-8) * 255.0
        normalized = np.clip(normalized, 0, 255).astype(np.uint8)

        from PIL import Image
        img = Image.fromarray(normalized, mode='L')
        img = img.transpose(Image.FLIP_TOP_BOTTOM)

        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)

        return send_file(
            img_bytes,
            mimetype='image/png',
            as_attachment=False,
            download_name=f'{plane}_slice_{index}.png'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/<session_id>/resample', methods=['POST'])
def resample_volume(session_id):
    try:
        if not dicom_reader.has_session(session_id):
            return jsonify({'error': 'Session not found'}), 404

        volume = dicom_reader.get_volume(session_id)
        meta = dicom_reader.get_meta(session_id)

        if volume is None or meta is None:
            return jsonify({'error': 'Failed to load volume data'}), 500

        data = request.get_json() or {}
        use_sitk = data.get('useSitk', False)

        if use_sitk:
            target_spacing = data.get('targetSpacing')
            if target_spacing:
                target_spacing = tuple(target_spacing)
            resampled, new_meta = recon_service.resample_volume_sitk(
                volume, meta, target_spacing
            )
        else:
            resampled, new_meta = recon_service.resample_volume_isotropic(
                volume, meta
            )

        dicom_reader._sessions[session_id]['volume'] = resampled
        dicom_reader._sessions[session_id]['meta'] = new_meta

        return jsonify({
            'success': True,
            'meta': new_meta
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/<session_id>', methods=['DELETE'])
def cleanup_session(session_id):
    try:
        dicom_reader.cleanup_session(session_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/sample', methods=['GET'])
def generate_sample_data():
    try:
        import numpy as np
        from scipy import ndimage

        dims = {'x': 128, 'y': 128, 'z': 64}
        spacing = {'x': 1.0, 'y': 1.0, 'z': 2.0}

        volume = np.zeros((dims['z'], dims['y'], dims['x']), dtype=np.int16)

        z, y, x = np.ogrid[:dims['z'], :dims['y'], :dims['x']]
        cx, cy, cz = dims['x']//2, dims['y']//2, dims['z']//2

        sphere_mask = (x-cx)**2 + (y-cy)**2 + (z-cz)**2 < 30**2
        volume[sphere_mask] = 1000

        ellipse_mask = ((x-cx)**2/25**2 + (y-cy)**2/35**2 + (z-cz)**2/20**2) < 1
        volume[ellipse_mask] = 500

        noise = np.random.normal(0, 50, volume.shape)
        volume = volume + noise.astype(np.int16)

        meta = {
            'dimensions': dims,
            'spacing': spacing,
            'origin': {'x': 0.0, 'y': 0.0, 'z': 0.0},
            'minValue': float(np.min(volume)),
            'maxValue': float(np.max(volume)),
            'patientInfo': {
                'name': 'Sample Patient',
                'id': 'SAMPLE-001',
                'studyDate': '20240101'
            }
        }

        session_id = 'sample_' + str(np.random.randint(100000))
        dicom_reader._sessions[session_id] = {
            'volume': volume,
            'meta': meta,
            'temp_dir': None
        }

        return jsonify({
            'sessionId': session_id,
            'meta': meta
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/<session_id>/curve-mpr', methods=['POST'])
def curve_mpr(session_id):
    try:
        if not dicom_reader.has_session(session_id):
            return jsonify({'error': 'Session not found'}), 404

        volume = dicom_reader.get_volume(session_id)
        meta = dicom_reader.get_meta(session_id)

        if volume is None or meta is None:
            return jsonify({'error': 'Failed to load volume data'}), 500

        data = request.get_json() or {}
        control_points = data.get('controlPoints', [])

        if len(control_points) < 2:
            return jsonify({'error': 'At least 2 control points required'}), 400

        method = data.get('method', 'bspline')
        num_samples = data.get('numSamples', 100)
        slice_width = data.get('sliceWidth', 50)
        slice_height = data.get('sliceHeight', 50)
        window_width = data.get('windowWidth')
        window_level = data.get('windowLevel')

        curve = curve_recon_service.interpolate_curve(
            control_points, num_samples=num_samples, method=method
        )

        result = curve_recon_service.extract_curved_mpr(
            volume, meta, curve,
            slice_width=slice_width,
            slice_height=slice_height,
            window_width=window_width,
            window_level=window_level
        )

        import base64
        result['straightened']['data'] = base64.b64encode(
            result['straightened']['data']
        ).decode('ascii')

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/<session_id>/vessel-centerline', methods=['POST'])
def get_vessel_centerline(session_id):
    try:
        if not dicom_reader.has_session(session_id):
            return jsonify({'error': 'Session not found'}), 404

        volume = dicom_reader.get_volume(session_id)
        meta = dicom_reader.get_meta(session_id)

        if volume is None or meta is None:
            return jsonify({'error': 'Failed to load volume data'}), 500

        data = request.get_json() or {}
        start_point = data.get('startPoint')
        end_point = data.get('endPoint')
        threshold = data.get('threshold', 100)

        if not start_point or not end_point:
            return jsonify({'error': 'startPoint and endPoint are required'}), 400

        centerline = curve_recon_service.generate_vessel_centerline(
            volume, meta,
            tuple(start_point), tuple(end_point),
            threshold=threshold
        )

        return jsonify({
            'centerline': centerline,
            'numPoints': len(centerline)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/fusion/upload-ct', methods=['POST'])
def upload_ct_for_fusion():
    try:
        files = request.files.getlist('files')
        if not files:
            return jsonify({'error': 'No files uploaded'}), 400

        session_id, meta = dicom_reader.upload_files(files)
        return jsonify({
            'sessionId': session_id,
            'meta': meta,
            'modality': 'CT'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/fusion/upload-pet', methods=['POST'])
def upload_pet_for_fusion():
    try:
        files = request.files.getlist('files')
        if not files:
            return jsonify({'error': 'No files uploaded'}), 400

        session_id, meta = dicom_reader.upload_files(files)
        return jsonify({
            'sessionId': session_id,
            'meta': meta,
            'modality': 'PET'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/fusion/fuse', methods=['POST'])
def fuse_volumes():
    try:
        data = request.get_json() or {}
        ct_session_id = data.get('ctSessionId')
        pet_session_id = data.get('petSessionId')
        blend_mode = data.get('blendMode', 'alpha')
        alpha = data.get('alpha', 0.5)
        color_map = data.get('colorMap', 'hot')

        if not ct_session_id or not pet_session_id:
            return jsonify({'error': 'Both session IDs are required'}), 400

        if not dicom_reader.has_session(ct_session_id):
            return jsonify({'error': 'CT session not found'}), 404
        if not dicom_reader.has_session(pet_session_id):
            return jsonify({'error': 'PET session not found'}), 404

        ct_volume = dicom_reader.get_volume(ct_session_id)
        ct_meta = dicom_reader.get_meta(ct_session_id)
        pet_volume = dicom_reader.get_volume(pet_session_id)
        pet_meta = dicom_reader.get_meta(pet_session_id)

        fused_volume, fused_meta = fusion_service.fuse_volumes(
            ct_volume, ct_meta,
            pet_volume, pet_meta,
            blend_mode=blend_mode,
            alpha=alpha,
            color_map=color_map
        )

        import base64
        result = base64.b64encode(fused_volume.tobytes()).decode('ascii')

        return jsonify({
            'volume': result,
            'meta': fused_meta,
            'blendMode': blend_mode,
            'alpha': alpha
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@dicom_bp.route('/fusion/slice', methods=['POST'])
def get_fusion_slice():
    try:
        data = request.get_json() or {}
        ct_session_id = data.get('ctSessionId')
        pet_session_id = data.get('petSessionId')
        plane = data.get('plane', 'axial')
        index = data.get('index', 0)
        blend_mode = data.get('blendMode', 'color_overlay')
        alpha = data.get('alpha', 0.5)

        if not ct_session_id or not pet_session_id:
            return jsonify({'error': 'Both session IDs are required'}), 400

        if not dicom_reader.has_session(ct_session_id):
            return jsonify({'error': 'CT session not found'}), 404
        if not dicom_reader.has_session(pet_session_id):
            return jsonify({'error': 'PET session not found'}), 404

        ct_volume = dicom_reader.get_volume(ct_session_id)
        ct_meta = dicom_reader.get_meta(ct_session_id)
        pet_volume = dicom_reader.get_volume(pet_session_id)
        pet_meta = dicom_reader.get_meta(pet_session_id)

        slice_result = fusion_service.get_fusion_slice(
            ct_volume, ct_meta,
            pet_volume, pet_meta,
            plane, index,
            blend_mode=blend_mode,
            alpha=alpha
        )

        slice_result['data'] = base64.b64encode(slice_result['data']).decode('ascii')
        return jsonify(slice_result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
