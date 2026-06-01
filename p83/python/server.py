from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import sys
import json
import base64
import cv2
import tempfile
import threading
from werkzeug.utils import secure_filename

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from video_processor import analyze_video, save_analysis_result, load_analysis_result, export_keyframes
from summary_generator import generate_summary_video, get_preview_frames

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = tempfile.mkdtemp(prefix='video_uploads_')
OUTPUT_FOLDER = tempfile.mkdtemp(prefix='video_output_')
ANALYSIS_FOLDER = tempfile.mkdtemp(prefix='video_analysis_')
KEYFRAMES_FOLDER = tempfile.mkdtemp(prefix='video_keyframes_')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(ANALYSIS_FOLDER, exist_ok=True)
os.makedirs(KEYFRAMES_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

task_progress = {}
task_results = {}


def run_analysis_task(task_id, video_path, analysis_path, video_id):
    def progress_callback(progress):
        task_progress[task_id] = {
            'status': 'processing',
            'progress': progress,
            'stage': 'analysis'
        }

    try:
        keyframes_dir = os.path.join(KEYFRAMES_FOLDER, video_id)
        result = analyze_video(video_path, progress_callback, export_keyframes=True, keyframes_dir=keyframes_dir)
        save_analysis_result(result, analysis_path)
        task_progress[task_id] = {
            'status': 'completed',
            'progress': 100,
            'stage': 'analysis'
        }
        task_results[task_id] = result
    except Exception as e:
        task_progress[task_id] = {
            'status': 'error',
            'progress': 0,
            'stage': 'analysis',
            'error': str(e)
        }


def run_summary_task(task_id, video_path, analysis_result, output_path):
    def progress_callback(progress):
        task_progress[task_id] = {
            'status': 'processing',
            'progress': progress,
            'stage': 'summary'
        }

    try:
        result = generate_summary_video(video_path, analysis_result, output_path, progress_callback)
        task_progress[task_id] = {
            'status': 'completed',
            'progress': 100,
            'stage': 'summary'
        }
        task_results[task_id] = result
    except Exception as e:
        task_progress[task_id] = {
            'status': 'error',
            'progress': 0,
            'stage': 'summary',
            'error': str(e)
        }


@app.route('/api/upload', methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400

    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    filename = secure_filename(file.filename)
    video_id = f"video_{os.urandom(8).hex()}"
    video_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{video_id}_{filename}")
    file.save(video_path)

    return jsonify({
        'video_id': video_id,
        'filename': filename,
        'video_path': video_path
    })


@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.json
    video_path = data.get('video_path')
    video_id = data.get('video_id')

    if not video_path or not os.path.exists(video_path):
        return jsonify({'error': 'Video file not found'}), 400

    task_id = f"analysis_{video_id}"
    analysis_path = os.path.join(ANALYSIS_FOLDER, f"{video_id}_analysis.json")

    thread = threading.Thread(
        target=run_analysis_task,
        args=(task_id, video_path, analysis_path, video_id)
    )
    thread.daemon = True
    thread.start()

    return jsonify({'task_id': task_id})


@app.route('/api/progress/<task_id>', methods=['GET'])
def get_progress(task_id):
    if task_id in task_progress:
        return jsonify(task_progress[task_id])
    return jsonify({'status': 'not_found'})


@app.route('/api/result/<task_id>', methods=['GET'])
def get_result(task_id):
    if task_id in task_results:
        return jsonify(task_results[task_id])
    return jsonify({'error': 'Result not found'}), 404


@app.route('/api/preview', methods=['POST'])
def preview():
    data = request.json
    video_path = data.get('video_path')
    analysis_result = data.get('analysis_result')
    num_frames = data.get('num_frames', 6)

    if not video_path or not os.path.exists(video_path):
        return jsonify({'error': 'Video file not found'}), 400

    try:
        frames = get_preview_frames(video_path, analysis_result, num_frames)
        frames_base64 = []

        for frame in frames:
            _, buffer = cv2.imencode('.jpg', frame)
            frames_base64.append(base64.b64encode(buffer).decode('utf-8'))

        return jsonify({
            'frames': frames_base64,
            'count': len(frames_base64)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/keyframes', methods=['POST'])
def get_keyframes():
    data = request.json
    analysis_result = data.get('analysis_result')
    limit = data.get('limit', 20)

    keyframes = analysis_result.get('keyframes', [])[:limit]
    
    return jsonify({
        'keyframes': keyframes,
        'count': len(keyframes)
    })


@app.route('/api/export_keyframes', methods=['POST'])
def handle_export_keyframes():
    data = request.json
    analysis_result = data.get('analysis_result')
    output_dir = data.get('output_dir')

    if not output_dir:
        output_dir = tempfile.mkdtemp(prefix='exported_keyframes_')

    try:
        paths = export_keyframes(analysis_result, output_dir)
        return jsonify({
            'success': True,
            'output_dir': output_dir,
            'count': len(paths),
            'paths': paths
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate_summary', methods=['POST'])
def generate_summary():
    data = request.json
    video_path = data.get('video_path')
    analysis_result = data.get('analysis_result')
    video_id = data.get('video_id')
    output_filename = data.get('output_filename', 'summary.mp4')
    draw_detections = data.get('draw_detections', False)

    if not video_path or not os.path.exists(video_path):
        return jsonify({'error': 'Video file not found'}), 400

    task_id = f"summary_{video_id}"
    output_path = os.path.join(OUTPUT_FOLDER, f"{video_id}_{output_filename}")

    thread = threading.Thread(
        target=run_summary_task,
        args=(task_id, video_path, analysis_result, output_path)
    )
    thread.daemon = True
    thread.start()

    return jsonify({'task_id': task_id})


@app.route('/api/export', methods=['POST'])
def export_video():
    data = request.json
    source_path = data.get('source_path')
    target_path = data.get('target_path')

    if not source_path or not os.path.exists(source_path):
        return jsonify({'error': 'Source file not found'}), 400

    try:
        import shutil
        shutil.copy2(source_path, target_path)
        return jsonify({'success': True, 'target_path': target_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    app.run(host='127.0.0.1', port=port, debug=False)
