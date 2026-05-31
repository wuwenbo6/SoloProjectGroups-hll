import os
import sys
import uuid
import json
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, render_template_string
from flask_cors import CORS
from werkzeug.utils import secure_filename
import librosa

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from feature_extractor import FeatureExtractor
from model_trainer import ModelTrainer, BIRD_SPECIES
from models import db, Recording, Prediction, BatchJob, init_db
from acoustic_indices import AcousticIndexCalculator, MigrationHotspotAnalyzer, EBirdExporter

app = Flask(__name__, static_folder='../static', static_url_path='/static')
CORS(app)

app.config['SECRET_KEY'] = 'bird-classifier-secret-key-2024'
db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'birds.db')
os.makedirs(os.path.dirname(db_path), exist_ok=True)
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024
app.config['UPLOAD_FOLDER'] = '../uploads'
app.config['SPECTROGRAM_FOLDER'] = '../static/spectrograms'

ALLOWED_EXTENSIONS = {'wav', 'mp3', 'flac', 'ogg', 'm4a'}

db.init_app(app)

feature_extractor = FeatureExtractor()
model_trainer = ModelTrainer(
    model_path=os.path.join(os.path.dirname(__file__), '../models/bird_classifier.pkl'),
    scaler_path=os.path.join(os.path.dirname(__file__), '../models/scaler.pkl'),
    label_encoder_path=os.path.join(os.path.dirname(__file__), '../models/label_encoder.pkl')
)
acoustic_calculator = AcousticIndexCalculator()
migration_analyzer = MigrationHotspotAnalyzer()
ebird_exporter = EBirdExporter()


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'supported_species': len(BIRD_SPECIES)
    })


@app.route('/api/species', methods=['GET'])
def get_species():
    return jsonify({
        'species': BIRD_SPECIES,
        'count': len(BIRD_SPECIES)
    })


@app.route('/api/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': f'File type not allowed. Allowed: {ALLOWED_EXTENSIONS}'}), 400
    
    try:
        filename = secure_filename(file.filename)
        unique_id = str(uuid.uuid4())[:8]
        saved_filename = f"{unique_id}_{filename}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], saved_filename)
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        file.save(file_path)
        
        y, sr = feature_extractor.load_audio(file_path)
        original_duration = librosa.get_duration(y=y, sr=sr)
        
        y_processed, processing_stats = feature_extractor.preprocess_audio(y)
        if len(y_processed) < feature_extractor.sample_rate * 0.5:
            y_processed = y
        
        features = feature_extractor.extract_features(y)
        
        spectrogram_path = os.path.join(app.config['SPECTROGRAM_FOLDER'], f"{unique_id}_spec.png")
        os.makedirs(app.config['SPECTROGRAM_FOLDER'], exist_ok=True)
        feature_extractor.generate_spectrogram(y, spectrogram_path)
        
        predictions = model_trainer.predict(features, top_k=5)
        
        acoustic_indices = acoustic_calculator.compute_all(y_processed)
        biodiversity_score = acoustic_calculator.compute_biodiversity_score(acoustic_indices)
        
        recording_time = datetime.utcnow()
        migration_analysis = migration_analyzer.analyze_recording(
            predictions, recording_time, acoustic_indices
        )
        
        recording = Recording(
            filename=filename,
            file_path=file_path,
            file_size=os.path.getsize(file_path),
            duration=original_duration,
            sample_rate=sr,
            user_ip=request.remote_addr
        )
        db.session.add(recording)
        db.session.flush()
        
        for i, pred in enumerate(predictions):
            prediction = Prediction(
                recording_id=recording.id,
                species=pred['species'],
                confidence=pred['confidence'],
                confidence_percent=pred['confidence_percent'],
                is_top_prediction=1 if i == 0 else 0
            )
            db.session.add(prediction)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'recording_id': recording.id,
            'filename': filename,
            'original_duration': round(original_duration, 2),
            'processed_duration': round(processing_stats.get('final_duration', original_duration), 2),
            'processing_stats': processing_stats,
            'top_prediction': predictions[0],
            'predictions': predictions,
            'spectrogram_url': f"/static/spectrograms/{unique_id}_spec.png",
            'acoustic_indices': {
                'aci': round(acoustic_indices.aci, 4),
                'adi': round(acoustic_indices.adi, 4),
                'bi': round(acoustic_indices.bi, 4),
                'h': round(acoustic_indices.h, 4),
                'nsi': round(acoustic_indices.nsi, 4),
                'sc': round(acoustic_indices.sc, 4),
                'spectral_entropy': round(acoustic_indices.spectral_entropy, 4),
                'temporal_entropy': round(acoustic_indices.temporal_entropy, 4),
                'acoustic_richness': round(acoustic_indices.acoustic_richness, 4),
                'biodiversity_score': round(biodiversity_score, 4)
            },
            'migration_analysis': migration_analysis
        })
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/batch-predict', methods=['POST'])
def batch_predict():
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400
    
    files = request.files.getlist('files')
    if len(files) == 0:
        return jsonify({'error': 'No files selected'}), 400
    
    job_id = str(uuid.uuid4())[:12]
    
    batch_job = BatchJob(
        job_id=job_id,
        status='processing',
        total_files=len(files)
    )
    db.session.add(batch_job)
    db.session.commit()
    
    results = []
    
    for file in files:
        if not allowed_file(file.filename):
            results.append({
                'filename': file.filename,
                'error': 'File type not allowed'
            })
            continue
        
        try:
            filename = secure_filename(file.filename)
            unique_id = str(uuid.uuid4())[:8]
            saved_filename = f"{unique_id}_{filename}"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], saved_filename)
            file.save(file_path)
            
            y, sr = feature_extractor.load_audio(file_path)
            original_duration = librosa.get_duration(y=y, sr=sr)
            
            y_processed, processing_stats = feature_extractor.preprocess_audio(y)
            if len(y_processed) < feature_extractor.sample_rate * 0.5:
                y_processed = y
            
            features = feature_extractor.extract_features(y)
            
            spectrogram_path = os.path.join(app.config['SPECTROGRAM_FOLDER'], f"{unique_id}_spec.png")
            feature_extractor.generate_spectrogram(y, spectrogram_path)
            
            predictions = model_trainer.predict(features, top_k=5)
            
            recording = Recording(
                filename=filename,
                file_path=file_path,
                file_size=os.path.getsize(file_path),
                duration=original_duration,
                sample_rate=sr,
                user_ip=request.remote_addr
            )
            db.session.add(recording)
            db.session.flush()
            
            for i, pred in enumerate(predictions):
                prediction = Prediction(
                    recording_id=recording.id,
                    species=pred['species'],
                    confidence=pred['confidence'],
                    confidence_percent=pred['confidence_percent'],
                    is_top_prediction=1 if i == 0 else 0
                )
                db.session.add(prediction)
            
            results.append({
                'filename': filename,
                'original_duration': round(original_duration, 2),
                'processed_duration': round(processing_stats.get('final_duration', original_duration), 2),
                'processing_stats': processing_stats,
                'top_prediction': predictions[0],
                'predictions': predictions,
                'spectrogram_url': f"/static/spectrograms/{unique_id}_spec.png"
            })
            
            batch_job.processed_files += 1
            db.session.commit()
            
        except Exception as e:
            results.append({
                'filename': file.filename,
                'error': str(e)
            })
    
    batch_job.status = 'completed'
    batch_job.completed_at = datetime.utcnow()
    batch_job.results = json.dumps(results)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'job_id': job_id,
        'total_files': len(files),
        'processed_files': batch_job.processed_files,
        'results': results
    })


@app.route('/api/recordings', methods=['GET'])
def get_recordings():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    recordings = Recording.query.order_by(Recording.uploaded_at.desc()).paginate(
        page=page, per_page=per_page
    )
    
    results = []
    for rec in recordings.items:
        top_pred = Prediction.query.filter_by(
            recording_id=rec.id, is_top_prediction=1
        ).first()
        
        results.append({
            'id': rec.id,
            'filename': rec.filename,
            'duration': rec.duration,
            'uploaded_at': rec.uploaded_at.isoformat(),
            'top_prediction': {
                'species': top_pred.species,
                'confidence_percent': top_pred.confidence_percent
            } if top_pred else None
        })
    
    return jsonify({
        'recordings': results,
        'total': recordings.total,
        'page': page,
        'per_page': per_page
    })


@app.route('/api/recordings/<int:recording_id>', methods=['GET'])
def get_recording_detail(recording_id):
    recording = Recording.query.get_or_404(recording_id)
    predictions = Prediction.query.filter_by(recording_id=recording_id).order_by(Prediction.confidence.desc()).all()
    
    return jsonify({
        'id': recording.id,
        'filename': recording.filename,
        'duration': recording.duration,
        'file_size': recording.file_size,
        'sample_rate': recording.sample_rate,
        'uploaded_at': recording.uploaded_at.isoformat(),
        'predictions': [{
            'species': p.species,
            'confidence': p.confidence,
            'confidence_percent': p.confidence_percent,
            'is_top_prediction': bool(p.is_top_prediction)
        } for p in predictions]
    })


@app.route('/api/stats', methods=['GET'])
def get_stats():
    total_recordings = Recording.query.count()
    total_predictions = Prediction.query.count()
    
    species_counts = db.session.query(
        Prediction.species,
        db.func.count(Prediction.id)
    ).filter_by(is_top_prediction=1).group_by(Prediction.species).all()
    
    return jsonify({
        'total_recordings': total_recordings,
        'total_predictions': total_predictions,
        'species_distribution': {s: c for s, c in species_counts}
    })


@app.route('/api/migration-timeline', methods=['GET'])
def get_migration_timeline():
    recordings = Recording.query.order_by(Recording.uploaded_at.asc()).all()
    
    recording_list = []
    for rec in recordings:
        top_pred = Prediction.query.filter_by(
            recording_id=rec.id, is_top_prediction=1
        ).first()
        
        recording_list.append({
            'id': rec.id,
            'uploaded_at': rec.uploaded_at.isoformat(),
            'top_prediction': {
                'species': top_pred.species,
                'confidence_percent': top_pred.confidence_percent
            } if top_pred else None
        })
    
    timeline = migration_analyzer.generate_timeline(recording_list)
    
    return jsonify({
        'timeline': timeline,
        'total_days': len(timeline)
    })


@app.route('/api/export/ebird/<int:recording_id>', methods=['GET'])
def export_ebird(recording_id):
    format_type = request.args.get('format', 'json')
    
    recording = Recording.query.get_or_404(recording_id)
    predictions = Prediction.query.filter_by(recording_id=recording_id).order_by(Prediction.confidence.desc()).all()
    
    predictions_list = [{
        'species': p.species,
        'confidence_percent': p.confidence_percent
    } for p in predictions]
    
    location = {
        'latitude': request.args.get('lat', 40.7128, type=float),
        'longitude': request.args.get('lon', -74.0060, type=float),
        'name': request.args.get('location', 'Unknown Location')
    }
    
    checklist = ebird_exporter.generate_checklist(
        predictions_list,
        location=location,
        observation_time=recording.uploaded_at,
        duration_minutes=max(5.0, recording.duration / 60)
    )
    
    if format_type == 'csv':
        csv_content = ebird_exporter.export_csv(checklist)
        return csv_content, 200, {
            'Content-Type': 'text/csv',
            'Content-Disposition': f'attachment; filename="ebird_checklist_{recording_id}.csv"'
        }
    elif format_type == 'xml':
        xml_content = ebird_exporter.export_ebird_format(checklist)
        return xml_content, 200, {
            'Content-Type': 'application/xml',
            'Content-Disposition': f'attachment; filename="ebird_checklist_{recording_id}.xml"'
        }
    else:
        return jsonify(checklist)


@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)


if __name__ == '__main__':
    init_db(app)
    
    with app.app_context():
        model_trainer.load_model()
    
    app.run(host='0.0.0.0', port=8000, debug=True)
