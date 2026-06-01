#!/usr/bin/env python3
"""
SCSI T10 PI Web Service
Flask backend for file upload, PI protection, and verification
"""

import os
import sys
import uuid
import tempfile
from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cli'))
from pi_engine import (
    PIContext, write_with_pi, read_with_pi, verify_file,
    inject_error, inject_errors_batch, get_dif_info,
    generate_report, SCSIPIError, TOTAL_BLOCK_SIZE
)

app = Flask(__name__, static_folder='static', static_url_path='/static', template_folder='templates')
CORS(app)

UPLOAD_FOLDER = tempfile.mkdtemp(prefix='scsi_pi_uploads_')
PROTECTED_FOLDER = tempfile.mkdtemp(prefix='scsi_pi_protected_')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROTECTED_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['PROTECTED_FOLDER'] = PROTECTED_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file:
        file_id = str(uuid.uuid4())
        original_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{file.filename}")
        file.save(original_path)

        file_size = os.path.getsize(original_path)

        return jsonify({
            'success': True,
            'file_id': file_id,
            'original_filename': file.filename,
            'original_size': file_size,
            'original_path': original_path
        })


@app.route('/api/protect', methods=['POST'])
def protect_file():
    data = request.json
    file_id = data.get('file_id')
    original_filename = data.get('original_filename')
    app_tag = data.get('app_tag', '0x0000')
    ref_mode = data.get('ref_mode', 'lba')
    guard_type = data.get('guard_type', 'crc16')

    original_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{original_filename}")
    if not os.path.exists(original_path):
        return jsonify({'error': 'File not found'}), 404

    protected_filename = f"{os.path.splitext(original_filename)[0]}_protected.bin"
    protected_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{protected_filename}")

    try:
        app_tag_int = int(app_tag, 0) if isinstance(app_tag, str) else int(app_tag)
        context = PIContext(
            app_tag=app_tag_int,
            ref_tag_mode=ref_mode,
            guard_type=guard_type
        )

        result = write_with_pi(original_path, protected_path, context)
        result['file_id'] = file_id
        result['protected_filename'] = protected_filename
        result['protected_path'] = protected_path

        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/verify', methods=['POST'])
def verify_file_endpoint():
    data = request.json
    file_id = data.get('file_id')
    protected_filename = data.get('protected_filename')
    app_tag = data.get('app_tag', '0x0000')
    ref_mode = data.get('ref_mode', 'lba')
    guard_type = data.get('guard_type', 'crc16')

    protected_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{protected_filename}")
    if not os.path.exists(protected_path):
        return jsonify({'error': 'Protected file not found'}), 404

    try:
        app_tag_int = int(app_tag, 0) if isinstance(app_tag, str) else int(app_tag)
        context = PIContext(
            app_tag=app_tag_int,
            ref_tag_mode=ref_mode,
            guard_type=guard_type
        )

        result = verify_file(protected_path, context)
        return jsonify({'success': True, 'data': result})
    except SCSIPIError as e:
        return jsonify({'success': True, 'data': {
            'verification_passed': False,
            'error': str(e),
            'error_type': 'format_error'
        }})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/upload-verify', methods=['POST'])
def upload_and_verify():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    app_tag = request.form.get('app_tag', '0x0000')
    ref_mode = request.form.get('ref_mode', 'lba')
    guard_type = request.form.get('guard_type', 'crc16')

    if file:
        file_id = str(uuid.uuid4())
        protected_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{file.filename}")
        file.save(protected_path)

        file_size = os.path.getsize(protected_path)

        if file_size % TOTAL_BLOCK_SIZE != 0:
            return jsonify({
                'success': True,
                'data': {
                    'verification_passed': False,
                    'total_size': file_size,
                    'error': f"File size {file_size} is not aligned to {TOTAL_BLOCK_SIZE} byte blocks. This may not be a PI-protected file.",
                    'error_type': 'alignment_error'
                }
            })

        try:
            app_tag_int = int(app_tag, 0) if isinstance(app_tag, str) else int(app_tag)
            context = PIContext(
                app_tag=app_tag_int,
                ref_tag_mode=ref_mode,
                guard_type=guard_type
            )

            result = verify_file(protected_path, context)
            result['original_filename'] = file.filename
            result['file_id'] = file_id

            os.remove(protected_path)

            return jsonify({'success': True, 'data': result})
        except Exception as e:
            os.remove(protected_path)
            return jsonify({'error': str(e)}), 500


@app.route('/api/upload-protect-verify', methods=['POST'])
def upload_protect_and_verify():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    app_tag = request.form.get('app_tag', '0x0000')
    ref_mode = request.form.get('ref_mode', 'lba')
    guard_type = request.form.get('guard_type', 'crc16')

    if file:
        file_id = str(uuid.uuid4())
        original_path = os.path.join(UPLOAD_FOLDER, f"{file_id}_{file.filename}")
        file.save(original_path)

        try:
            app_tag_int = int(app_tag, 0) if isinstance(app_tag, str) else int(app_tag)
            context = PIContext(
                app_tag=app_tag_int,
                ref_tag_mode=ref_mode,
                guard_type=guard_type
            )

            protected_filename = f"{os.path.splitext(file.filename)[0]}_protected.bin"
            protected_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{protected_filename}")

            protect_result = write_with_pi(original_path, protected_path, context)

            verify_result = verify_file(protected_path, context)

            os.remove(original_path)
            os.remove(protected_path)

            return jsonify({
                'success': True,
                'data': {
                    'original_filename': file.filename,
                    'protect_result': protect_result,
                    'verify_result': verify_result
                }
            })
        except Exception as e:
            if os.path.exists(original_path):
                os.remove(original_path)
            if os.path.exists(protected_path):
                os.remove(protected_path)
            return jsonify({'error': str(e)}), 500


@app.route('/api/inject', methods=['POST'])
def inject_error_endpoint():
    data = request.json
    file_id = data.get('file_id')
    protected_filename = data.get('protected_filename')
    sector = data.get('sector', 0)
    error_type = data.get('error_type', 'data')
    byte_offset = data.get('byte_offset', 0)
    flip_mask = data.get('flip_mask')

    protected_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{protected_filename}")
    if not os.path.exists(protected_path):
        return jsonify({'error': 'Protected file not found'}), 404

    try:
        corrupted_filename = f"{os.path.splitext(protected_filename)[0]}_corrupted.bin"
        corrupted_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{corrupted_filename}")

        result = inject_error(protected_path, corrupted_path, sector, error_type,
                              byte_offset=byte_offset,
                              flip_mask=int(flip_mask, 0) if flip_mask else None)
        result['corrupted_filename'] = corrupted_filename
        result['corrupted_path'] = corrupted_path

        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/inject-batch', methods=['POST'])
def inject_batch_endpoint():
    data = request.json
    file_id = data.get('file_id')
    protected_filename = data.get('protected_filename')
    error_specs = data.get('error_specs', [])

    protected_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{protected_filename}")
    if not os.path.exists(protected_path):
        return jsonify({'error': 'Protected file not found'}), 404

    try:
        corrupted_filename = f"{os.path.splitext(protected_filename)[0]}_corrupted.bin"
        corrupted_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{corrupted_filename}")

        result = inject_errors_batch(protected_path, corrupted_path, error_specs)
        result['corrupted_filename'] = corrupted_filename
        result['corrupted_path'] = corrupted_path

        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/report', methods=['POST'])
def generate_report_endpoint():
    data = request.json
    file_id = data.get('file_id')
    protected_filename = data.get('protected_filename')
    app_tag = data.get('app_tag', '0x0000')
    ref_mode = data.get('ref_mode', 'lba')
    guard_type = data.get('guard_type', 'crc16')
    include_intact = data.get('include_intact', False)

    protected_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{protected_filename}")
    if not os.path.exists(protected_path):
        return jsonify({'error': 'Protected file not found'}), 404

    try:
        app_tag_int = int(app_tag, 0) if isinstance(app_tag, str) else int(app_tag)
        context = PIContext(
            app_tag=app_tag_int,
            ref_tag_mode=ref_mode,
            guard_type=guard_type
        )

        report = generate_report(protected_path, context, include_intact=include_intact)
        report['original_filename'] = protected_filename

        return jsonify({'success': True, 'data': report})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/upload-report', methods=['POST'])
def upload_and_report():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    app_tag = request.form.get('app_tag', '0x0000')
    ref_mode = request.form.get('ref_mode', 'lba')
    guard_type = request.form.get('guard_type', 'crc16')
    include_intact = request.form.get('include_intact', 'false').lower() == 'true'

    if file:
        file_id = str(uuid.uuid4())
        protected_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{file.filename}")
        file.save(protected_path)

        try:
            app_tag_int = int(app_tag, 0) if isinstance(app_tag, str) else int(app_tag)
            context = PIContext(
                app_tag=app_tag_int,
                ref_tag_mode=ref_mode,
                guard_type=guard_type
            )

            report = generate_report(protected_path, context, include_intact=include_intact)
            report['original_filename'] = file.filename

            os.remove(protected_path)

            return jsonify({'success': True, 'data': report})
        except Exception as e:
            os.remove(protected_path)
            return jsonify({'error': str(e)}), 500


@app.route('/api/report/download', methods=['POST'])
def download_report():
    data = request.json
    file_id = data.get('file_id')
    protected_filename = data.get('protected_filename')
    app_tag = data.get('app_tag', '0x0000')
    ref_mode = data.get('ref_mode', 'lba')
    guard_type = data.get('guard_type', 'crc16')
    include_intact = data.get('include_intact', False)

    protected_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{protected_filename}")
    if not os.path.exists(protected_path):
        return jsonify({'error': 'Protected file not found'}), 404

    try:
        app_tag_int = int(app_tag, 0) if isinstance(app_tag, str) else int(app_tag)
        context = PIContext(
            app_tag=app_tag_int,
            ref_tag_mode=ref_mode,
            guard_type=guard_type
        )

        report_filename = f"{os.path.splitext(protected_filename)[0]}_report.json"
        report_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{report_filename}")

        generate_report(protected_path, context, output_file=report_path,
                       include_intact=include_intact)

        return send_file(report_path, as_attachment=True, download_name=report_filename)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/info', methods=['POST'])
def get_dif_info_endpoint():
    data = request.json
    file_id = data.get('file_id')
    protected_filename = data.get('protected_filename')

    protected_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{protected_filename}")
    if not os.path.exists(protected_path):
        return jsonify({'error': 'Protected file not found'}), 404

    try:
        result = get_dif_info(protected_path)
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/download/<file_id>/<filename>')
def download_protected(file_id, filename):
    protected_path = os.path.join(PROTECTED_FOLDER, f"{file_id}_{filename}")
    if not os.path.exists(protected_path):
        return jsonify({'error': 'File not found'}), 404

    return send_file(protected_path, as_attachment=True, download_name=filename)


if __name__ == '__main__':
    print(f"Upload folder: {UPLOAD_FOLDER}")
    print(f"Protected folder: {PROTECTED_FOLDER}")
    app.run(host='0.0.0.0', port=5001, debug=True)
