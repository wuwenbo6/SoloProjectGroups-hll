import os
import sys
import time
import base64
import numpy as np
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database.database import init_db, get_db
from database.models import TrainingVideo
from model.inference import MockLipReadingInference

try:
    from model.cnn3d import TENSORFLOW_AVAILABLE
    from model.inference import LipReadingInference
except ImportError:
    TENSORFLOW_AVAILABLE = False
    LipReadingInference = None

app = Flask(__name__)
app.config['SECRET_KEY'] = 'lip-reading-secret-key-2024'

CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:5173", "http://127.0.0.1:5173"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

socketio = SocketIO(
    app,
    cors_allowed_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    async_mode='threading',
    logger=True,
    engineio_logger=False
)

USE_MOCK_MODEL = True

if USE_MOCK_MODEL or not TENSORFLOW_AVAILABLE:
    inference_engine = MockLipReadingInference()
else:
    inference_engine = LipReadingInference()

init_db()

TRAINING_VIDEOS_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'training_videos')
os.makedirs(TRAINING_VIDEOS_DIR, exist_ok=True)

@app.route('/')
def index():
    return jsonify({
        'status': 'running',
        'model_ready': inference_engine.is_ready(),
        'message': 'Lip Reading API Server'
    })

@app.route('/api/model/status')
def model_status():
    return jsonify({
        'ready': inference_engine.is_ready(),
        'mock_mode': USE_MOCK_MODEL
    })

@app.route('/api/training-data', methods=['GET'])
def get_training_data():
    db: Session = next(get_db())
    videos = db.query(TrainingVideo).all()
    
    return jsonify([{
        'id': v.id,
        'consonant_label': v.consonant_label,
        'frame_count': v.frame_count,
        'duration': v.duration,
        'file_path': v.file_path,
        'created_at': v.created_at.isoformat()
    } for v in videos])

@app.route('/api/training-data', methods=['POST'])
def upload_training_data():
    try:
        data = request.json
        consonant_label = data.get('consonant_label')
        frames = data.get('frames', [])
        duration = data.get('duration', 0)
        
        if not consonant_label or not frames:
            return jsonify({'error': 'Missing required fields'}), 400
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{consonant_label}_{timestamp}.npy"
        filepath = os.path.join(TRAINING_VIDEOS_DIR, filename)
        
        frames_array = np.array(frames)
        np.save(filepath, frames_array)
        
        db: Session = next(get_db())
        video = TrainingVideo(
            consonant_label=consonant_label,
            frame_count=len(frames),
            duration=duration,
            file_path=filepath
        )
        db.add(video)
        db.commit()
        db.refresh(video)
        
        return jsonify({
            'success': True,
            'id': video.id,
            'message': f'Saved {len(frames)} frames for {consonant_label}'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/training-data/<int:video_id>', methods=['DELETE'])
def delete_training_data(video_id):
    db: Session = next(get_db())
    video = db.query(TrainingVideo).filter(TrainingVideo.id == video_id).first()
    
    if not video:
        return jsonify({'error': 'Video not found'}), 404
    
    try:
        if os.path.exists(video.file_path):
            os.remove(video.file_path)
    except Exception as e:
        print(f"Error deleting file: {e}")
    
    db.delete(video)
    db.commit()
    
    return jsonify({'success': True, 'message': 'Video deleted'})

@app.route('/api/training-data/stats')
def training_stats():
    db: Session = next(get_db())
    
    stats = {}
    for row in db.query(TrainingVideo.consonant_label, 
                        db.func.count(TrainingVideo.id),
                        db.func.sum(TrainingVideo.frame_count))\
                .group_by(TrainingVideo.consonant_label).all():
        stats[row[0]] = {
            'count': row[1],
            'total_frames': row[2]
        }
    
    return jsonify(stats)

@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')
    emit('status', {'status': 'connected'})
    
    if inference_engine.is_ready():
        emit('status', {'status': 'ready'})

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')

@socketio.on('frames')
def handle_frames(data):
    try:
        frames = data.get('frames', [])
        timestamp = data.get('timestamp', time.time())
        
        if len(frames) == 0:
            return
        
        consonant, confidence = inference_engine.predict(frames)
        
        emit('result', {
            'consonant': consonant,
            'confidence': confidence,
            'timestamp': timestamp
        })
        
    except Exception as e:
        print(f"Error processing frames: {e}")
        emit('error', {'message': str(e)})

@socketio.on('start_recording')
def handle_start_recording(data):
    label = data.get('label', 'unknown')
    print(f"Start recording for label: {label}")
    emit('status', {'status': 'recording', 'label': label})

@socketio.on('stop_recording')
def handle_stop_recording():
    print("Stop recording")
    emit('status', {'status': 'ready'})

if __name__ == '__main__':
    print("=" * 60)
    print("Lip Reading Backend Server")
    print("=" * 60)
    print(f"Mock mode: {USE_MOCK_MODEL}")
    print(f"Model ready: {inference_engine.is_ready()}")
    print("=" * 60)
    socketio.run(app, host='0.0.0.0', port=9876, debug=True, allow_unsafe_werkzeug=True)
