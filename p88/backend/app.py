from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import numpy as np
import io
import os
import uuid
from eit_enhanced import get_eit_system
from database import (
    init_db, get_db, save_measurement,
    get_all_measurements, get_measurement_by_id,
    delete_measurement, measurement_to_dict
)

app = Flask(__name__)
CORS(app)

eit_system = get_eit_system()

init_db()

EXPORT_DIR = '/tmp/eit_exports'
os.makedirs(EXPORT_DIR, exist_ok=True)


@app.route('/api/mesh', methods=['GET'])
def get_mesh():
    try:
        mesh_data = eit_system.get_mesh_data()
        return jsonify({
            'success': True,
            'data': mesh_data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/simulate', methods=['POST'])
def simulate():
    try:
        data = request.json
        anomaly = data.get('anomaly')
        
        if anomaly is None:
            anomaly = eit_system.create_sample_anomaly()
        
        v0, v1 = eit_system.forward_solve(anomaly)
        
        return jsonify({
            'success': True,
            'data': {
                'v0': v0.tolist(),
                'v1': v1.tolist(),
                'anomaly': anomaly
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/reconstruct', methods=['POST'])
def reconstruct():
    try:
        data = request.json
        v0 = np.array(data.get('v0', []))
        v1 = np.array(data.get('v1', []))
        method = data.get('method', 'greit')
        grid_size = data.get('grid_size', 32)
        lamb = data.get('lambda', 0.05)
        smooth_sigma = data.get('smooth_sigma', 0.8)
        denoise_level = data.get('denoise_level', 3)
        
        if len(v0) == 0 or len(v1) == 0:
            anomaly = eit_system.create_sample_anomaly()
            v0, v1 = eit_system.forward_solve(anomaly)
        
        if method == 'greit':
            ds = eit_system.reconstruct_greit(v0, v1, lamb=lamb)
        elif method == 'gn':
            ds = eit_system.reconstruct_gauss_newton(v0, v1, lamb_init=lamb)
        else:
            return jsonify({
                'success': False,
                'error': 'Unknown method. Use "greit" or "gn"'
            }), 400
        
        ds = eit_system.post_process(ds, sigma=smooth_sigma)
        ds = (ds - np.mean(ds)) / (np.std(ds) + 1e-8)
        
        volume_data = eit_system.interpolate_to_3d(ds, grid_size)
        
        return jsonify({
            'success': True,
            'data': {
                'reconstruction': ds.tolist(),
                'volume': volume_data,
                'method': method
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/reconstruct/custom', methods=['POST'])
def reconstruct_custom():
    try:
        data = request.json
        v0 = np.array(data.get('v0', []))
        v1 = np.array(data.get('v1', []))
        method = data.get('method', 'greit')
        grid_size = data.get('grid_size', 32)
        
        len_v0 = len(v0) if v0 is not None else 0
        len_v1 = len(v1) if v1 is not None else 0
        
        if len_v0 == 0 or len_v1 == 0:
            return jsonify({
                'success': False,
                'error': 'v0 and v1 must be provided'
            }), 400
        
        if method == 'greit':
            ds = eit_system.reconstruct_greit(v0, v1)
        elif method == 'gn':
            ds = eit_system.reconstruct_gauss_newton(v0, v1)
        else:
            return jsonify({
                'success': False,
                'error': 'Unknown method. Use "greit" or "gn"'
            }), 400
        
        volume_data = eit_system.interpolate_to_3d(ds, grid_size)
        
        return jsonify({
            'success': True,
            'data': {
                'reconstruction': ds.tolist(),
                'volume': volume_data,
                'method': method
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/measurements', methods=['GET'])
def list_measurements():
    try:
        db = next(get_db())
        skip = int(request.args.get('skip', 0))
        limit = int(request.args.get('limit', 100))
        
        measurements = get_all_measurements(db, skip, limit)
        result = [measurement_to_dict(m) for m in measurements]
        
        return jsonify({
            'success': True,
            'data': result,
            'count': len(result)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/measurements', methods=['POST'])
def create_measurement():
    try:
        db = next(get_db())
        data = request.json
        
        measurement = save_measurement(db, data)
        
        return jsonify({
            'success': True,
            'data': measurement_to_dict(measurement)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/measurements/<int:measurement_id>', methods=['GET'])
def get_measurement(measurement_id):
    try:
        db = next(get_db())
        measurement = get_measurement_by_id(db, measurement_id)
        
        if not measurement:
            return jsonify({
                'success': False,
                'error': 'Measurement not found'
            }), 404
        
        v0, v1 = measurement.get_voltage_data()
        
        result = measurement_to_dict(measurement)
        result['v0'] = v0
        result['v1'] = v1
        result['reconstruction'] = measurement.get_reconstruction_data()
        result['volume'] = measurement.get_volume_data()
        
        return jsonify({
            'success': True,
            'data': result
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/measurements/<int:measurement_id>', methods=['DELETE'])
def delete_measurement_endpoint(measurement_id):
    try:
        db = next(get_db())
        success = delete_measurement(db, measurement_id)
        
        if not success:
            return jsonify({
                'success': False,
                'error': 'Measurement not found'
            }), 404
        
        return jsonify({
            'success': True,
            'message': 'Measurement deleted'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/anomaly/sample', methods=['GET'])
def get_sample_anomaly():
    try:
        anomaly = eit_system.create_sample_anomaly()
        return jsonify({
            'success': True,
            'data': anomaly
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/electrode/check', methods=['POST'])
def check_electrode_contact():
    try:
        data = request.json
        v1 = np.array(data.get('v1', []))
        
        if len(v1) == 0:
            anomaly = eit_system.create_sample_anomaly()
            _, v1 = eit_system.forward_solve(anomaly)
        
        contact_info = eit_system.check_electrode_contact(v1)
        
        return jsonify({
            'success': True,
            'data': contact_info
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dynamic/sequence', methods=['POST'])
def generate_dynamic_sequence():
    try:
        data = request.json
        n_frames = data.get('n_frames', 30)
        anomaly = data.get('anomaly')
        
        frames = eit_system.generate_dynamic_sequence(n_frames=n_frames, anomaly=anomaly)
        
        return jsonify({
            'success': True,
            'data': {
                'frames': frames,
                'n_frames': len(frames)
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dynamic/reconstruct', methods=['POST'])
def reconstruct_dynamic_frame():
    try:
        data = request.json
        v0 = np.array(data.get('v0', []))
        v1 = np.array(data.get('v1', []))
        method = data.get('method', 'greit')
        grid_size = data.get('grid_size', 32)
        lamb = data.get('lambda', 0.05)
        smooth_sigma = data.get('smooth_sigma', 0.8)
        temporal_smooth = data.get('temporal_smooth', True)
        
        if len(v0) == 0 or len(v1) == 0:
            anomaly = eit_system.create_sample_anomaly()
            v0, v1 = eit_system.forward_solve(anomaly)
        
        ds = eit_system.reconstruct_frame(
            v0, v1, method=method, lamb=lamb, 
            smooth_sigma=smooth_sigma, temporal_smooth=temporal_smooth
        )
        
        volume_data = eit_system.interpolate_to_3d(ds, grid_size)
        
        return jsonify({
            'success': True,
            'data': {
                'reconstruction': ds.tolist(),
                'volume': volume_data,
                'method': method
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dynamic/reset', methods=['POST'])
def reset_dynamic():
    try:
        eit_system.last_reconstruction = None
        eit_system.frame_buffer.clear()
        
        return jsonify({
            'success': True,
            'message': 'Dynamic buffer reset'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/export/dicom', methods=['POST'])
def export_dicom():
    try:
        data = request.json
        volume_data = data.get('volume_data')
        patient_name = data.get('patient_name', 'EIT_PATIENT')
        
        if volume_data is None:
            anomaly = eit_system.create_sample_anomaly()
            v0, v1 = eit_system.forward_solve(anomaly)
            ds = eit_system.reconstruct_greit(v0, v1)
            volume_data = eit_system.interpolate_to_3d(ds)
        
        file_id = uuid.uuid4().hex[:8]
        filename = f"eit_{file_id}.dcm"
        filepath = os.path.join(EXPORT_DIR, filename)
        
        result = eit_system.export_dicom(volume_data, filepath, patient_name)
        
        if not result['success']:
            return jsonify(result), 500
        
        actual_file = result.get('filename', filepath)
        actual_filename = os.path.basename(actual_file)
        format_type = result.get('dicom_info', {}).get('format', 'DICOM')
        
        if format_type == 'RAW':
            header_file = result.get('header_file')
            if header_file and os.path.exists(header_file):
                import zipfile
                zip_filename = f"eit_{file_id}_export.zip"
                zip_filepath = os.path.join(EXPORT_DIR, zip_filename)
                
                with zipfile.ZipFile(zip_filepath, 'w', zipfile.ZIP_DEFLATED) as zf:
                    zf.write(actual_file, actual_filename)
                    zf.write(header_file, os.path.basename(header_file))
                
                return send_file(
                    zip_filepath,
                    as_attachment=True,
                    download_name=zip_filename,
                    mimetype='application/zip'
                )
        
        return send_file(
            actual_file,
            as_attachment=True,
            download_name=actual_filename,
            mimetype='application/octet-stream'
        )
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/export/dicom/info', methods=['GET'])
def dicom_info():
    try:
        from eit_enhanced import DICOM_AVAILABLE
        return jsonify({
            'success': True,
            'data': {
                'dicom_available': DICOM_AVAILABLE
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
