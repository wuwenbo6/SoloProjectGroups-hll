import os
import uuid
from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename
from config import Config
from database import (
    insert_file, update_file_status, get_file, get_all_files, delete_file,
    insert_detection, get_detections_by_file, get_all_detections
)
from services.point_cloud import processor
from services.detection import detector
from services.metrics import calculator

api_bp = Blueprint('api', __name__)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS

@api_bp.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_id = str(uuid.uuid4())
        file_ext = os.path.splitext(filename)[1].lower()
        saved_filename = f"{file_id}{file_ext}"
        file_path = os.path.join(Config.UPLOAD_FOLDER, saved_filename)
        
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        file.save(file_path)
        
        file_size = os.path.getsize(file_path)
        
        try:
            points = processor.load_pcd(file_path)
            point_count = points.shape[0]
        except Exception as e:
            return jsonify({'error': f'Failed to load point cloud: {str(e)}'}), 400
        
        insert_file(file_id, filename, file_path, file_size, point_count)
        
        return jsonify({
            'file_id': file_id,
            'file_name': filename,
            'file_size': file_size,
            'point_count': point_count,
            'status': 'uploaded'
        }), 201
    
    return jsonify({'error': 'Invalid file type'}), 400

@api_bp.route('/files', methods=['GET'])
def list_files():
    files = get_all_files()
    return jsonify({'files': files})

@api_bp.route('/files/<file_id>', methods=['GET'])
def get_file_info(file_id):
    file_info = get_file(file_id)
    if not file_info:
        return jsonify({'error': 'File not found'}), 404
    return jsonify(file_info)

@api_bp.route('/files/<file_id>', methods=['DELETE'])
def delete_file_route(file_id):
    file_info = get_file(file_id)
    if not file_info:
        return jsonify({'error': 'File not found'}), 404
    
    try:
        if os.path.exists(file_info['file_path']):
            os.remove(file_info['file_path'])
    except Exception as e:
        pass
    
    delete_file(file_id)
    return jsonify({'message': 'File deleted successfully'})

@api_bp.route('/pointcloud/<file_id>', methods=['GET'])
def get_point_cloud(file_id):
    file_info = get_file(file_id)
    if not file_info:
        return jsonify({'error': 'File not found'}), 404
    
    try:
        points = processor.load_pcd(file_info['file_path'])
        points_list = processor.serialize_points(points)
        
        return jsonify({
            'file_id': file_id,
            'points': points_list,
            'point_count': points.shape[0],
            'dimensions': points.shape[1]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/detect/<file_id>', methods=['POST'])
def run_detection(file_id):
    file_info = get_file(file_id)
    if not file_info:
        return jsonify({'error': 'File not found'}), 404
    
    update_file_status(file_id, 'processing')
    
    try:
        points = processor.load_pcd(file_info['file_path'])
        
        detections = detector.detect_enhanced(
            points,
            multi_scale=True,
            remove_ground=True
        )
        
        for det in detections:
            insert_detection(
                file_id,
                file_info['file_name'],
                det['class_name'],
                det['confidence'],
                det['bbox']
            )
        
        update_file_status(file_id, 'completed')
        
        detection_results = get_detections_by_file(file_id)
        
        return jsonify({
            'file_id': file_id,
            'detections': detection_results,
            'count': len(detection_results),
            'enhanced': True
        })
        
    except Exception as e:
        update_file_status(file_id, 'error')
        return jsonify({'error': str(e)}), 500

@api_bp.route('/detections/<file_id>', methods=['GET'])
def get_detections(file_id):
    detections = get_detections_by_file(file_id)
    return jsonify({
        'file_id': file_id,
        'detections': detections,
        'count': len(detections)
    })

@api_bp.route('/detections', methods=['GET'])
def list_all_detections():
    detections = get_all_detections()
    return jsonify({
        'detections': detections,
        'count': len(detections)
    })

@api_bp.route('/metrics/map', methods=['GET'])
def calculate_map():
    try:
        all_detections = get_all_detections()
        
        formatted_detections = {}
        for det in all_detections:
            file_id = det['file_id']
            if file_id not in formatted_detections:
                formatted_detections[file_id] = []
            
            formatted_detections[file_id].append({
                'class_name': det['class_name'],
                'confidence': det['confidence'],
                'bbox': {
                    'x': det['x'],
                    'y': det['y'],
                    'z': det['z'],
                    'w': det['w'],
                    'h': det['h'],
                    'l': det['l'],
                    'rotation_y': det['rotation_y']
                }
            })
        
        ground_truth = {}
        
        metrics_result = calculator.calculate_map(
            formatted_detections,
            ground_truth,
            class_names=['Car', 'Pedestrian']
        )
        
        return jsonify(metrics_result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/metrics/pr-curve', methods=['GET'])
def get_pr_curve():
    class_name = request.args.get('class', 'Car')
    
    try:
        all_detections = get_all_detections()
        
        detections = [{
            'class_name': det['class_name'],
            'confidence': det['confidence'],
            'bbox': {
                'x': det['x'],
                'y': det['y'],
                'z': det['z'],
                'w': det['w'],
                'h': det['h'],
                'l': det['l'],
                'rotation_y': det['rotation_y']
            }
        } for det in all_detections]
        
        ground_truth = []
        
        pr_data = calculator.get_pr_curve_data(
            detections,
            ground_truth,
            class_name=class_name
        )
        
        return jsonify(pr_data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/pointcloud/analyze/<file_id>', methods=['GET'])
def analyze_point_cloud(file_id):
    file_info = get_file(file_id)
    if not file_info:
        return jsonify({'error': 'File not found'}), 404
    
    try:
        points = processor.load_pcd(file_info['file_path'])
        
        analysis = {}
        
        non_ground, ground, plane_model = processor.remove_ground_ransac(points)
        analysis['ground_points'] = len(ground)
        analysis['non_ground_points'] = len(non_ground)
        analysis['ground_plane'] = plane_model.tolist() if hasattr(plane_model, 'tolist') else list(plane_model)
        
        split_result = processor.split_by_distance(non_ground)
        analysis['near_points'] = int(split_result['near_count'])
        analysis['mid_points'] = int(split_result['mid_count'])
        analysis['far_points'] = int(split_result['far_count'])
        
        if len(non_ground) > 0:
            xyz = non_ground[:, :3]
            distances = np.sqrt(np.sum(xyz[:, [0, 2]] ** 2, axis=1))
            analysis['avg_distance'] = float(np.mean(distances))
            analysis['max_distance'] = float(np.max(distances))
            analysis['min_distance'] = float(np.min(distances))
        
        return jsonify(analysis)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/tracker/reset', methods=['POST'])
def reset_tracker():
    from services.tracker import tracker
    tracker.reset()
    return jsonify({'message': 'Tracker reset successfully'})

@api_bp.route('/tracker/status', methods=['GET'])
def get_tracker_status():
    from services.tracker import tracker
    tracks = tracker.get_all_tracks()
    return jsonify({
        'frame_count': tracker.frame_count,
        'active_tracks': len(tracks),
        'tracks': tracks
    })

@api_bp.route('/tracker/update', methods=['POST'])
def update_tracker():
    from services.tracker import tracker
    
    data = request.json
    detections = data.get('detections', [])
    frame_id = data.get('frame_id')
    
    tracks = tracker.update(detections, frame_id=frame_id)
    
    return jsonify({
        'tracks': tracks,
        'frame_count': tracker.frame_count
    })

@api_bp.route('/rosbag/upload', methods=['POST'])
def upload_rosbag():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and file.filename.endswith('.bag'):
        import uuid
        from werkzeug.utils import secure_filename
        from config import Config
        
        filename = secure_filename(file.filename)
        file_id = str(uuid.uuid4())
        saved_filename = f"{file_id}.bag"
        file_path = os.path.join(Config.UPLOAD_FOLDER, saved_filename)
        
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        file.save(file_path)
        
        file_size = os.path.getsize(file_path)
        
        from services.ros_processor import ros_processor
        try:
            bag_info = ros_processor.get_bag_info(file_path)
        except Exception as e:
            bag_info = {'error': str(e)}
        
        return jsonify({
            'file_id': file_id,
            'file_name': filename,
            'file_path': file_path,
            'file_size': file_size,
            'bag_info': bag_info
        }), 201
    
    return jsonify({'error': 'Invalid file type. Please upload .bag file'}), 400

@api_bp.route('/rosbag/info/<file_id>', methods=['GET'])
def get_rosbag_info(file_id):
    from config import Config
    file_path = os.path.join(Config.UPLOAD_FOLDER, f"{file_id}.bag")
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Bag file not found'}), 404
    
    from services.ros_processor import ros_processor
    try:
        bag_info = ros_processor.get_bag_info(file_path)
        return jsonify(bag_info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/rosbag/frame/<file_id>/<int:frame_idx>', methods=['GET'])
def get_rosbag_frame(file_id, frame_idx):
    from config import Config
    file_path = os.path.join(Config.UPLOAD_FOLDER, f"{file_id}.bag")
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Bag file not found'}), 404
    
    from services.ros_processor import ros_processor
    try:
        frame = ros_processor.extract_frame(file_path, frame_idx)
        if frame is None:
            return jsonify({'error': 'Frame not found'}), 404
        
        return jsonify({
            'frame_id': frame.frame_id,
            'timestamp': frame.timestamp,
            'points': frame.points.flatten().tolist(),
            'point_count': len(frame.points),
            'topic': frame.topic
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/rosbag/process/<file_id>', methods=['POST'])
def process_rosbag(file_id):
    from config import Config
    file_path = os.path.join(Config.UPLOAD_FOLDER, f"{file_id}.bag")
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Bag file not found'}), 404
    
    data = request.json or {}
    max_frames = data.get('max_frames', 10)
    skip_frames = data.get('skip_frames', 0)
    start_frame = data.get('start_frame', 0)
    
    from services.ros_processor import ros_processor
    from services.detection import detector
    from services.tracker import tracker
    
    try:
        tracker.reset()
        
        results = ros_processor.process_bag_detection(
            file_path,
            detector,
            tracker_instance=tracker,
            max_frames=max_frames,
            skip_frames=skip_frames,
            start_frame=start_frame
        )
        
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/export/<file_id>', methods=['POST'])
def export_detections(file_id):
    data = request.json or {}
    export_format = data.get('format', 'pascal_voc')
    output_dir = data.get('output_dir', 'exports')
    
    from database import get_detections_by_file, get_file
    from services.export import exporter
    
    file_info = get_file(file_id)
    if not file_info:
        return jsonify({'error': 'File not found'}), 404
    
    detections = get_detections_by_file(file_id)
    
    formatted_detections = [{
        'class_name': det['class_name'],
        'confidence': det['confidence'],
        'bbox': {
            'x': det['x'],
            'y': det['y'],
            'z': det['z'],
            'w': det['w'],
            'h': det['h'],
            'l': det['l'],
            'rotation_y': det['rotation_y']
        }
    } for det in detections]
    
    try:
        os.makedirs(output_dir, exist_ok=True)
        
        if export_format == 'pascal_voc':
            xml_content = exporter.to_pascal_voc_xml(
                formatted_detections,
                file_info['file_name']
            )
            return jsonify({
                'format': 'pascal_voc',
                'content': xml_content,
                'detection_count': len(detections)
            })
        
        elif export_format == 'yolo':
            yolo_content = exporter.to_yolo_format(formatted_detections)
            return jsonify({
                'format': 'yolo',
                'content': yolo_content,
                'detection_count': len(detections)
            })
        
        elif export_format == 'kitti':
            kitti_content = exporter.to_kitti_format(formatted_detections)
            return jsonify({
                'format': 'kitti',
                'content': kitti_content,
                'detection_count': len(detections)
            })
        
        elif export_format == 'coco':
            coco_data = exporter.to_coco_json({
                file_info['file_name']: formatted_detections
            })
            return jsonify({
                'format': 'coco',
                'content': coco_data,
                'detection_count': len(detections)
            })
        
        else:
            return jsonify({'error': f'Unsupported format: {export_format}'}), 400
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/export/batch', methods=['POST'])
def export_batch():
    data = request.json or {}
    file_ids = data.get('file_ids', [])
    export_format = data.get('format', 'pascal_voc')
    output_dir = data.get('output_dir', 'exports')
    
    from database import get_detections_by_file, get_file
    from services.export import exporter
    
    frames_data = []
    
    for file_id in file_ids:
        file_info = get_file(file_id)
        if not file_info:
            continue
        
        detections = get_detections_by_file(file_id)
        formatted_detections = [{
            'class_name': det['class_name'],
            'confidence': det['confidence'],
            'bbox': {
                'x': det['x'],
                'y': det['y'],
                'z': det['z'],
                'w': det['w'],
                'h': det['h'],
                'l': det['l'],
                'rotation_y': det['rotation_y']
            }
        } for det in detections]
        
        frames_data.append({
            'frame_id': len(frames_data),
            'detections': formatted_detections
        })
    
    try:
        export_summary = exporter.export_dataset(
            frames_data,
            output_dir,
            format=export_format
        )
        
        return jsonify(export_summary)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy', 
        'message': 'PointCloud Detection API is running',
        'features': {
            'ground_removal': True,
            'multi_scale_detection': True,
            'adaptive_threshold': True,
            'geometric_validation': True,
            'sort_tracking': True,
            'rosbag_processing': True,
            'label_export': True
        }
    })
