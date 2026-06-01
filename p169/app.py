from flask import Flask, render_template, request, jsonify, Response, stream_with_context, send_file
from iso7816_parser import (
    parse_sim_file, parse_sim_file_streaming, parse_sim_file_generator,
    StreamISO7816Parser, export_to_xml, export_file_to_xml
)
import os
import io
import json
import tempfile
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 512 * 1024 * 1024
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['CHUNK_SIZE'] = 64 * 1024

ALLOWED_EXTENSIONS = {'bin', 'hex', 'sim', 'dat'}

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


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

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        try:
            file_size = os.path.getsize(filepath)

            with open(filepath, 'rb') as f:
                hex_preview = f.read(64).hex().upper()

            file_info = {
                'filename': filename,
                'size': file_size,
                'hex_preview': hex_preview
            }

            parsed_structure = parse_sim_file_streaming(filepath, chunk_size=app.config['CHUNK_SIZE'])

            return jsonify({
                'success': True,
                'file_info': file_info,
                'structure': parsed_structure
            })
        except Exception as e:
            return jsonify({'error': f'Error parsing file: {str(e)}'}), 500
        finally:
            if os.path.exists(filepath):
                os.remove(filepath)
    else:
        return jsonify({'error': 'Invalid file type'}), 400


@app.route('/api/upload/stream', methods=['POST'])
def upload_stream():
    def generate():
        try:
            if 'file' not in request.files:
                yield json.dumps({'error': 'No file part'}) + '\n'
                return

            file = request.files['file']
            if file.filename == '':
                yield json.dumps({'error': 'No selected file'}) + '\n'
                return

            if not allowed_file(file.filename):
                yield json.dumps({'error': 'Invalid file type'}) + '\n'
                return

            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)

            try:
                file_size = os.path.getsize(filepath)
                yield json.dumps({
                    'type': 'file_info',
                    'filename': filename,
                    'size': file_size
                }) + '\n'

                count = 0
                for file_obj in parse_sim_file_generator(filepath, chunk_size=app.config['CHUNK_SIZE']):
                    count += 1
                    yield json.dumps({
                        'type': 'file',
                        'data': file_obj,
                        'count': count
                    }) + '\n'

                yield json.dumps({
                    'type': 'complete',
                    'total_files': count
                }) + '\n'
            finally:
                if os.path.exists(filepath):
                    os.remove(filepath)

        except Exception as e:
            yield json.dumps({'error': str(e)}) + '\n'

    return Response(
        stream_with_context(generate()),
        mimetype='application/x-ndjson'
    )


@app.route('/api/parse', methods=['POST'])
def parse_data():
    try:
        data = request.get_data()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        parsed_structure = parse_sim_file(data)
        return jsonify({
            'success': True,
            'size': len(data),
            'structure': parsed_structure
        })
    except Exception as e:
        return jsonify({'error': f'Error parsing data: {str(e)}'}), 500


@app.route('/api/parse/stream', methods=['POST'])
def parse_stream():
    def generate():
        try:
            data = request.get_data()
            if not data:
                yield json.dumps({'error': 'No data provided'}) + '\n'
                return

            from iso7816_parser import StreamISO7816Parser
            stream = io.BytesIO(data)
            parser = StreamISO7816Parser(stream, chunk_size=app.config['CHUNK_SIZE'])

            yield json.dumps({
                'type': 'file_info',
                'size': len(data)
            }) + '\n'

            count = 0
            for file_obj in parser.parse_stream_generator(total_size=len(data)):
                count += 1
                yield json.dumps({
                    'type': 'file',
                    'data': {
                        'fid': file_obj.fid,
                        'name': file_obj.name,
                        'file_type': file_obj.file_type,
                        'path': file_obj.path,
                        'size': file_obj.size,
                        'file_offset': file_obj.file_offset
                    },
                    'count': count
                }) + '\n'

            yield json.dumps({
                'type': 'complete',
                'total_files': count
            }) + '\n'

        except Exception as e:
            yield json.dumps({'error': str(e)}) + '\n'

    return Response(
        stream_with_context(generate()),
        mimetype='application/x-ndjson'
    )


@app.route('/api/sample', methods=['GET'])
def get_sample():
    sample_data = b'\x00' * 256
    parsed_structure = parse_sim_file(sample_data)
    return jsonify({
        'success': True,
        'size': len(sample_data),
        'structure': parsed_structure
    })


@app.route('/api/paths', methods=['GET'])
def get_all_paths():
    try:
        sample_data = b'\x00' * 256
        from iso7816_parser import StreamISO7816Parser
        stream = io.BytesIO(sample_data)
        parser = StreamISO7816Parser(stream)
        parser.parse(total_size=len(sample_data))
        paths = parser.get_all_paths()
        return jsonify({
            'success': True,
            'paths': paths
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/find/<path:file_path>', methods=['GET'])
def find_file(file_path):
    try:
        sample_data = b'\x00' * 256
        from iso7816_parser import StreamISO7816Parser
        stream = io.BytesIO(sample_data)
        parser = StreamISO7816Parser(stream)
        parser.parse(total_size=len(sample_data))
        file_obj = parser.find_file_by_path(file_path)
        if file_obj:
            return jsonify({
                'success': True,
                'file': {
                    'fid': file_obj.fid,
                    'name': file_obj.name,
                    'file_type': file_obj.file_type,
                    'path': file_obj.path,
                    'size': file_obj.size,
                    'children_count': len(file_obj.children)
                }
            })
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/records/<path:file_path>', methods=['GET'])
def get_file_records(file_path):
    try:
        sample_data = b'\x00' * 256
        stream = io.BytesIO(sample_data)
        parser = StreamISO7816Parser(stream)
        parser.parse(total_size=len(sample_data), parse_records=True)
        file_obj = parser.find_file_by_path(file_path)
        if file_obj and file_obj.records:
            return jsonify({
                'success': True,
                'fid': file_obj.fid,
                'name': file_obj.name,
                'path': file_obj.path,
                'ef_type': file_obj.ef_type,
                'record_size': file_obj.record_size,
                'record_count': file_obj.record_count,
                'records': [
                    {
                        'record_number': r.record_number,
                        'offset': r.offset,
                        'hex_data': r.hex_data,
                        'parsed_fields': r.parsed_fields
                    }
                    for r in file_obj.records
                ]
            })
        else:
            return jsonify({
                'success': True,
                'fid': file_obj.fid if file_obj else None,
                'name': file_obj.name if file_obj else None,
                'path': file_obj.path if file_obj else None,
                'records': []
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/export/xml', methods=['GET'])
def export_xml():
    try:
        sample_data = b'\x00' * 256
        stream = io.BytesIO(sample_data)
        parser = StreamISO7816Parser(stream)
        root = parser.parse(total_size=len(sample_data), parse_records=True)
        xml_content = export_to_xml(root, pretty=True)
        return Response(
            xml_content,
            mimetype='application/xml',
            headers={
                'Content-Disposition': 'attachment; filename=simcard_filesystem.xml'
            }
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/export/xml/download', methods=['GET'])
def download_xml():
    try:
        sample_data = b'\x00' * 256
        stream = io.BytesIO(sample_data)
        parser = StreamISO7816Parser(stream)
        root = parser.parse(total_size=len(sample_data), parse_records=True)
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.xml', delete=False)
        try:
            xml_content = export_to_xml(root, pretty=True)
            tmp.write(xml_content)
            tmp.flush()
            tmp.close()
            return send_file(
                tmp.name,
                mimetype='application/xml',
                as_attachment=True,
                download_name='simcard_filesystem.xml'
            )
        finally:
            os.unlink(tmp.name)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/upload/export/xml', methods=['POST'])
def upload_and_export_xml():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        try:
            file_size = os.path.getsize(filepath)
            stream = open(filepath, 'rb')
            parser = StreamISO7816Parser(stream, chunk_size=app.config['CHUNK_SIZE'])
            root = parser.parse(total_size=file_size, parse_records=True)
            xml_content = export_to_xml(root, pretty=True)
            return Response(
                xml_content,
                mimetype='application/xml',
                headers={
                    'Content-Disposition': f'attachment; filename={os.path.splitext(filename)[0]}_filesystem.xml'
                }
            )
        except Exception as e:
            return jsonify({'error': f'Error exporting XML: {str(e)}'}), 500
        finally:
            if os.path.exists(filepath):
                os.remove(filepath)
    else:
        return jsonify({'error': 'Invalid file type'}), 400


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
