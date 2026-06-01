import os
import json
import uuid
import numpy as np
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

from database import (
    init_db, create_task, update_task_status, get_task, get_all_tasks,
    save_registration_params, get_registration_params,
    save_point_cloud_file, get_point_cloud_files,
    save_overlap_heatmap, get_overlap_heatmap
)
from ndt_register import (NDTRegistration, register_multiple_stations,
                              PoseGraphOptimizer, RegistrationQualityAssessor,
                              PointCloudExporter, register_multiple_stations_optimized)

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
OUTPUT_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'outputs')
ALLOWED_EXTENSIONS = {'pcd', 'ply', 'las', 'laz', 'xyz', 'xyzn'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app.config['MAX_CONTENT_LENGTH'] = 512 * 1024 * 1024

init_db()


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def generate_demo_point_clouds():
    demo_folder = os.path.join(UPLOAD_FOLDER, 'demo')
    os.makedirs(demo_folder, exist_ok=True)

    demo1_path = os.path.join(demo_folder, 'demo_station1.ply')
    demo2_path = os.path.join(demo_folder, 'demo_station2.ply')

    if not os.path.exists(demo1_path):
        import open3d as o3d
        np.random.seed(42)

        def create_feature_scene():
            pts = []
            for _ in range(8000):
                x = np.random.uniform(-5, 5)
                y = np.random.uniform(-5, 5)
                z = 0.0 + np.random.normal(0, 0.05)
                pts.append([x, y, z])

            for _ in range(6000):
                wall_x = np.random.choice([-3, 0, 3])
                x = wall_x + np.random.normal(0, 0.05)
                y = np.random.uniform(-4, 4)
                z = np.random.uniform(0, 2.5)
                pts.append([x, y, z])

            for _ in range(4000):
                wall_y = np.random.choice([-4, 4])
                x = np.random.uniform(-5, 5)
                y = wall_y + np.random.normal(0, 0.05)
                z = np.random.uniform(0, 2.5)
                pts.append([x, y, z])

            sphere_centers = [[-2, -2, 0.8], [2, 1, 1.2], [0, 3, 0.6]]
            for cx, cy, cz in sphere_centers:
                for _ in range(1000):
                    theta = np.random.uniform(0, 2 * np.pi)
                    phi = np.random.uniform(0, np.pi)
                    r = 0.5 + np.random.normal(0, 0.02)
                    x = cx + r * np.sin(phi) * np.cos(theta)
                    y = cy + r * np.sin(phi) * np.sin(theta)
                    z = cz + r * np.cos(phi)
                    pts.append([x, y, z])

            for _ in range(4000):
                x = np.random.uniform(-2, 2)
                y = np.random.uniform(-2, 2)
                z = 2.5 + np.random.normal(0, 0.05)
                pts.append([x, y, z])

            return np.array(pts)

        pts1 = create_feature_scene()
        pcd1 = o3d.geometry.PointCloud()
        pcd1.points = o3d.utility.Vector3dVector(pts1)
        colors1 = np.tile([0.2, 0.6, 0.9], (len(pts1), 1))
        pcd1.colors = o3d.utility.Vector3dVector(colors1)
        o3d.io.write_point_cloud(demo1_path, pcd1)

        pts2 = create_feature_scene()
        angle = np.radians(15)
        rot_matrix = np.array([
            [np.cos(angle), -np.sin(angle), 0],
            [np.sin(angle), np.cos(angle), 0],
            [0, 0, 1]
        ])
        pts2 = pts2 @ rot_matrix.T + [2.0, 1.0, 0.15]

        pcd2 = o3d.geometry.PointCloud()
        pcd2.points = o3d.utility.Vector3dVector(pts2)
        colors2 = np.tile([0.9, 0.6, 0.2], (len(pts2), 1))
        pcd2.colors = o3d.utility.Vector3dVector(colors2)
        o3d.io.write_point_cloud(demo2_path, pcd2)

    return [demo1_path, demo2_path]


@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')


@app.route('/api/upload', methods=['POST'])
def upload_files():
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400

    files = request.files.getlist('files')
    saved_files = []

    for file in files:
        if file.filename == '':
            continue
        if allowed_file(file.filename):
            filename = secure_filename(file.filename)
            unique_name = f"{uuid.uuid4().hex[:8]}_{filename}"
            filepath = os.path.join(UPLOAD_FOLDER, unique_name)
            file.save(filepath)
            saved_files.append({
                'filename': filename,
                'unique_name': unique_name,
                'path': filepath,
                'size': os.path.getsize(filepath)
            })

    return jsonify({
        'success': True,
        'files': saved_files,
        'count': len(saved_files)
    })


@app.route('/api/register', methods=['POST'])
def register_point_clouds():
    try:
        data = request.json
        task_name = data.get('task_name', f'NDT_{uuid.uuid4().hex[:6]}')
        source_path = data.get('source_path')
        target_path = data.get('target_path')
        params = data.get('params', {})

        if not source_path or not target_path:
            return jsonify({'error': 'Both source and target paths are required'}), 400

        if not os.path.exists(source_path):
            return jsonify({'error': f'Source file not found: {source_path}'}), 404
        if not os.path.exists(target_path):
            return jsonify({'error': f'Target file not found: {target_path}'}), 404

        task_id = create_task(task_name, source_path, target_path)
        update_task_status(task_id, 'processing')

        voxel_size = params.get('voxel_size', 0.1)
        distance_threshold = params.get('distance_threshold', 0.5)
        max_iterations = params.get('max_iterations', 30)
        tolerance = params.get('tolerance', 1e-6)
        use_ndt = params.get('use_ndt', True)
        use_multi_scale = params.get('use_multi_scale', True)
        min_fitness_threshold = params.get('min_fitness_threshold', 0.3)

        ndt = NDTRegistration(
            voxel_size=voxel_size,
            distance_threshold=distance_threshold,
            max_iterations=max_iterations,
            tolerance=tolerance,
            use_multi_scale=use_multi_scale,
            min_fitness_threshold=min_fitness_threshold
        )

        result = ndt.register(source_path, target_path, use_ndt=use_ndt)

        save_registration_params(
            task_id,
            params,
            ndt.transformation,
            result['fitness'],
            result['inlier_rmse'],
            result['correspondence_set_size'],
            result.get('overlap_before', 0.0),
            result.get('overlap_after', 0.0),
            json.dumps(result.get('registration_history', [])),
            json.dumps(result.get('warnings', [])),
            result.get('used_fallback', False)
        )

        save_point_cloud_file(
            task_id, source_path, 'pcd',
            result['source_points'], is_source=True
        )
        save_point_cloud_file(
            task_id, target_path, 'pcd',
            result['target_points'], is_source=False
        )

        source_filename = f'task_{task_id}_source.json'
        target_filename = f'task_{task_id}_target.json'
        merged_filename = f'task_{task_id}_merged.json'
        transformed_filename = f'task_{task_id}_transformed.json'

        source_json = os.path.join(OUTPUT_FOLDER, source_filename)
        target_json = os.path.join(OUTPUT_FOLDER, target_filename)
        merged_json = os.path.join(OUTPUT_FOLDER, merged_filename)
        transformed_source_json = os.path.join(OUTPUT_FOLDER, transformed_filename)

        ndt.save_point_cloud_json(ndt.source, source_json)
        ndt.save_point_cloud_json(ndt.target, target_json)
        ndt.save_point_cloud_json(ndt.get_merged_point_cloud(), merged_json)
        ndt.save_point_cloud_json(ndt.get_transformed_source(), transformed_source_json)

        heatmap_data = ndt.compute_overlap_heatmap(resolution=64)
        save_overlap_heatmap(
            task_id,
            heatmap_data,
            heatmap_data['resolution'],
            heatmap_data['min_overlap'],
            heatmap_data['max_overlap']
        )

        update_task_status(task_id, 'completed')

        return jsonify({
            'success': True,
            'task_id': task_id,
            'task_name': task_name,
            'result': result,
            'source_json': f'/api/outputs/{source_filename}',
            'target_json': f'/api/outputs/{target_filename}',
            'merged_json': f'/api/outputs/{merged_filename}',
            'transformed_source_json': f'/api/outputs/{transformed_filename}',
            'heatmap': heatmap_data
        })

    except Exception as e:
        task_id = request.json.get('task_id') if request.json else None
        if task_id:
            update_task_status(task_id, 'failed', str(e))
        return jsonify({'error': str(e)}), 500


@app.route('/api/tasks', methods=['GET'])
def list_tasks():
    tasks = get_all_tasks()
    return jsonify({'tasks': tasks})


@app.route('/api/tasks/<int:task_id>', methods=['GET'])
def get_task_detail(task_id):
    task = get_task(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404

    params = get_registration_params(task_id)
    files = get_point_cloud_files(task_id)
    heatmap = get_overlap_heatmap(task_id)

    return jsonify({
        'task': task,
        'params': params,
        'files': files,
        'heatmap': heatmap
    })


@app.route('/api/tasks/<int:task_id>/params', methods=['GET'])
def get_params(task_id):
    params = get_registration_params(task_id)
    return jsonify({'params': params})


@app.route('/api/tasks/<int:task_id>/heatmap', methods=['GET'])
def get_heatmap(task_id):
    heatmap = get_overlap_heatmap(task_id)
    if not heatmap:
        return jsonify({'error': 'Heatmap not found'}), 404
    return jsonify(heatmap)


@app.route('/api/outputs/<path:filename>')
def get_output_file(filename):
    filepath = os.path.join(OUTPUT_FOLDER, filename)
    if os.path.exists(filepath):
        return send_file(filepath)
    return jsonify({'error': 'File not found'}), 404


@app.route('/api/demo', methods=['POST'])
def run_demo():
    try:
        demo_files = generate_demo_point_clouds()

        task_name = 'NDT_Demo_MultiStation'
        task_id = create_task(task_name, demo_files[0], demo_files[1])
        update_task_status(task_id, 'processing')

        ndt = NDTRegistration(
            voxel_size=0.05,
            distance_threshold=0.3,
            max_iterations=50,
            tolerance=1e-6,
            use_multi_scale=True,
            min_fitness_threshold=0.3
        )

        result = ndt.register(demo_files[0], demo_files[1], use_ndt=True)

        save_registration_params(
            task_id,
            {'voxel_size': 0.05, 'distance_threshold': 0.3, 'max_iterations': 50},
            ndt.transformation,
            result['fitness'],
            result['inlier_rmse'],
            result['correspondence_set_size'],
            result.get('overlap_before', 0.0),
            result.get('overlap_after', 0.0),
            json.dumps(result.get('registration_history', [])),
            json.dumps(result.get('warnings', [])),
            result.get('used_fallback', False)
        )

        source_filename = f'task_{task_id}_source.json'
        target_filename = f'task_{task_id}_target.json'
        merged_filename = f'task_{task_id}_merged.json'
        transformed_filename = f'task_{task_id}_transformed.json'

        source_json = os.path.join(OUTPUT_FOLDER, source_filename)
        target_json = os.path.join(OUTPUT_FOLDER, target_filename)
        merged_json = os.path.join(OUTPUT_FOLDER, merged_filename)
        transformed_source_json = os.path.join(OUTPUT_FOLDER, transformed_filename)

        ndt.save_point_cloud_json(ndt.source, source_json)
        ndt.save_point_cloud_json(ndt.target, target_json)
        ndt.save_point_cloud_json(ndt.get_merged_point_cloud(), merged_json)
        ndt.save_point_cloud_json(ndt.get_transformed_source(), transformed_source_json)

        heatmap_data = ndt.compute_overlap_heatmap(resolution=64)
        save_overlap_heatmap(
            task_id, heatmap_data, heatmap_data['resolution'],
            heatmap_data['min_overlap'], heatmap_data['max_overlap']
        )

        update_task_status(task_id, 'completed')

        return jsonify({
            'success': True,
            'task_id': task_id,
            'task_name': task_name,
            'result': result,
            'source_json': f'/api/outputs/{source_filename}',
            'target_json': f'/api/outputs/{target_filename}',
            'merged_json': f'/api/outputs/{merged_filename}',
            'transformed_source_json': f'/api/outputs/{transformed_filename}',
            'heatmap': heatmap_data
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/register/multi', methods=['POST'])
def register_multi_station():
    try:
        data = request.json
        task_name = data.get('task_name', f'NDT_Multi_{uuid.uuid4().hex[:6]}')
        file_paths = data.get('file_paths', [])
        params = data.get('params', {})

        if len(file_paths) < 2:
            return jsonify({'error': 'At least 2 point cloud files are required'}), 400

        for fp in file_paths:
            if not os.path.exists(fp):
                return jsonify({'error': f'File not found: {fp}'}), 404

        task_id = create_task(task_name, file_paths[0], file_paths[-1])
        update_task_status(task_id, 'processing')

        voxel_size = params.get('voxel_size', 0.1)
        distance_threshold = params.get('distance_threshold', 0.5)
        max_iterations = params.get('max_iterations', 30)

        result = register_multiple_stations(
            file_paths,
            voxel_size=voxel_size,
            distance_threshold=distance_threshold,
            max_iterations=max_iterations
        )

        for i, fp in enumerate(file_paths):
            save_point_cloud_file(
                task_id, fp, 'pcd',
                result['total_points'] if i == 0 else 0,
                is_source=(i == 0)
            )

        for i, t in enumerate(result['transformations']):
            save_registration_params(
                task_id,
                {'voxel_size': voxel_size, 'distance_threshold': distance_threshold,
                 'max_iterations': max_iterations, 'pair': i},
                np.array(t),
                result['results'][i]['fitness'],
                result['results'][i]['inlier_rmse'],
                result['results'][i]['correspondence_set_size']
            )

        save_overlap_heatmap(
            task_id,
            result['heatmap'],
            result['heatmap']['resolution'],
            result['heatmap']['min_overlap'],
            result['heatmap']['max_overlap']
        )

        update_task_status(task_id, 'completed')

        return jsonify({
            'success': True,
            'task_id': task_id,
            'task_name': task_name,
            'num_stations': len(file_paths),
            'results': result['results'],
            'metrics': result['metrics'],
            'total_points': result['total_points'],
            'heatmap': result['heatmap']
        })

    except Exception as e:
        task_id = request.json.get('task_id') if request.json else None
        if task_id:
            update_task_status(task_id, 'failed', str(e))
        return jsonify({'error': str(e)}), 500


@app.route('/api/register/optimized', methods=['POST'])
def register_optimized():
    try:
        data = request.json
        task_name = data.get('task_name', f'NDT_Optimized_{uuid.uuid4().hex[:6]}')
        file_paths = data.get('file_paths', [])
        params = data.get('params', {})

        if len(file_paths) < 2:
            return jsonify({'error': 'At least 2 point cloud files are required'}), 400

        for fp in file_paths:
            if not os.path.exists(fp):
                return jsonify({'error': f'File not found: {fp}'}), 404

        task_id = create_task(task_name, file_paths[0], file_paths[-1])
        update_task_status(task_id, 'processing')

        voxel_size = params.get('voxel_size', 0.1)
        distance_threshold = params.get('distance_threshold', 0.5)
        max_iterations = params.get('max_iterations', 30)
        use_loop_closure = params.get('use_loop_closure', True)
        loop_closure_fitness_threshold = params.get('loop_closure_fitness_threshold', 0.3)

        result = register_multiple_stations_optimized(
            file_paths,
            voxel_size=voxel_size,
            distance_threshold=distance_threshold,
            max_iterations=max_iterations,
            use_loop_closure=use_loop_closure,
            loop_closure_fitness_threshold=loop_closure_fitness_threshold
        )

        for i, fp in enumerate(file_paths):
            save_point_cloud_file(
                task_id, fp, 'pcd',
                result.get('total_points', 0),
                is_source=(i == 0)
            )

        for i, t in enumerate(result['transformations']):
            save_registration_params(
                task_id,
                {'voxel_size': voxel_size, 'distance_threshold': distance_threshold,
                 'max_iterations': max_iterations, 'pair': i,
                 'loop_closure_detected': result.get('optimized', False)},
                np.array(t),
                result['quality_assessment']['assessments'][i]['fitness'] if i < len(result['quality_assessment']['assessments']) else 0.0,
                result['quality_assessment']['assessments'][i].get('inlier_rmse', 0.0) if i < len(result['quality_assessment']['assessments']) else 0.0,
                result['quality_assessment']['assessments'][i].get('correspondence_set_size', 0) if i < len(result['quality_assessment']['assessments']) else 0,
                result['quality_assessment']['assessments'][i].get('distance_analysis', {}).get('rmse', 0.0) if i < len(result['quality_assessment']['assessments']) else 0.0,
                result['quality_assessment']['assessments'][i].get('quality_grade', 'Unknown') if i < len(result['quality_assessment']['assessments']) else 'Unknown',
                json.dumps(result.get('warnings', [])),
                result.get('optimized', False)
            )

        save_overlap_heatmap(
            task_id,
            result['heatmap'],
            result['heatmap']['resolution'],
            result['heatmap']['min_overlap'],
            result['heatmap']['max_overlap']
        )

        update_task_status(task_id, 'completed')

        return jsonify({
            'success': True,
            'task_id': task_id,
            'task_name': task_name,
            'num_stations': len(file_paths),
            'results': result['results'],
            'metrics': result['metrics'],
            'transformations': result['transformations'],
            'loop_closure': result.get('loop_closure'),
            'quality_assessment': result['quality_assessment'],
            'total_points': result.get('total_points', 0),
            'heatmap': result['heatmap'],
            'warnings': result.get('warnings', []),
            'optimized': result.get('optimized', False)
        })

    except Exception as e:
        task_id = request.json.get('task_id') if request.json else None
        if task_id:
            update_task_status(task_id, 'failed', str(e))
        return jsonify({'error': str(e)}), 500


@app.route('/api/quality/assess', methods=['POST'])
def assess_quality():
    try:
        data = request.json
        file_paths = data.get('file_paths', [])
        transformations = data.get('transformations', [])
        voxel_size = data.get('voxel_size', 0.1)
        reference_transformations = data.get('reference_transformations', None)

        if len(file_paths) < 2:
            return jsonify({'error': 'At least 2 point cloud files are required'}), 400

        assessor = RegistrationQualityAssessor()

        if len(transformations) != len(file_paths) - 1:
            return jsonify({'error': 'Number of transformations must be len(file_paths) - 1'}), 400

        transforms = [np.array(t) for t in transformations]

        if reference_transformations:
            ref_transforms = [np.array(t) for t in reference_transformations]
        else:
            ref_transforms = [None] * len(transforms)

        all_assessments = []
        for i in range(len(file_paths) - 1):
            assessment = assessor.assess_registration_quality(
                file_paths[i], file_paths[i + 1],
                transforms[i],
                reference_transformation=ref_transforms[i],
                voxel_size=voxel_size
            )
            assessment['pair'] = f'{i}-{i+1}'
            all_assessments.append(assessment)

        overall = {
            'num_pairs': len(all_assessments),
            'avg_fitness': sum(a['fitness'] for a in all_assessments) / len(all_assessments),
            'avg_rmse': sum(a.get('distance_analysis', {}).get('rmse', a['inlier_rmse']) for a in all_assessments) / len(all_assessments),
            'worst_fitness': min(a['fitness'] for a in all_assessments),
            'assessments': all_assessments
        }

        return jsonify({
            'success': True,
            'quality_assessment': overall
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/loop-closure/detect', methods=['POST'])
def detect_loop_closure():
    try:
        data = request.json
        file_paths = data.get('file_paths', [])
        voxel_size = data.get('voxel_size', 0.1)
        distance_threshold = data.get('distance_threshold', 0.5)
        max_iterations = data.get('max_iterations', 30)
        fitness_threshold = data.get('fitness_threshold', 0.3)

        if len(file_paths) < 3:
            return jsonify({'error': 'At least 3 point cloud files are required for loop closure detection'}), 400

        optimizer = PoseGraphOptimizer(
            voxel_size=voxel_size,
            distance_threshold=distance_threshold,
            max_iterations=max_iterations,
            loop_closure_fitness_threshold=fitness_threshold
        )

        loop_closure = optimizer.detect_loop_closure(file_paths)

        return jsonify({
            'success': True,
            'loop_closure': loop_closure
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/export', methods=['POST'])
def export_point_cloud():
    try:
        data = request.json
        file_paths = data.get('file_paths', [])
        transformations = data.get('transformations', [])
        file_format = data.get('format', 'ply')
        ascii_mode = data.get('ascii', False)
        voxel_size = data.get('voxel_size', None)
        output_name = data.get('output_name', f'export_{uuid.uuid4().hex[:6]}')

        resolved_paths = []
        for fp in file_paths:
            if os.path.isabs(fp):
                resolved_paths.append(fp)
            else:
                resolved = os.path.join(os.path.dirname(os.path.abspath(__file__)), fp)
                resolved_paths.append(resolved)

        if len(file_paths) < 2:
            return jsonify({'error': 'At least 2 point cloud files are required'}), 400

        if len(transformations) != len(file_paths) - 1:
            return jsonify({'error': 'Number of transformations must be len(file_paths) - 1'}), 400

        exporter = PointCloudExporter()
        transforms = [np.array(t) for t in transformations]

        output_path = os.path.join(OUTPUT_FOLDER, output_name)

        export_result = exporter.export_merged_point_cloud(
            resolved_paths, transforms,
            output_path=output_path,
            file_format=file_format,
            ascii_mode=ascii_mode,
            voxel_size=voxel_size
        )

        return jsonify({
            'success': True,
            'export': export_result,
            'download_url': f'/api/outputs/{export_result["file_name"]}'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/export/formats', methods=['GET'])
def get_export_formats():
    exporter = PointCloudExporter()
    return jsonify({
        'formats': exporter.get_available_formats()
    })


@app.route('/api/demo/loop-closure', methods=['POST'])
def run_demo_loop_closure():
    try:
        demo_files = generate_demo_point_clouds()

        extra_file = os.path.join(UPLOAD_FOLDER, 'demo', 'demo_station3.ply')
        if not os.path.exists(extra_file):
            import open3d as o3d
            np.random.seed(123)
            pts3 = np.random.uniform(-5, 5, (25000, 3))
            pts3[:, 2] = np.random.normal(0, 0.05, 25000)
            pcd3 = o3d.geometry.PointCloud()
            pcd3.points = o3d.utility.Vector3dVector(pts3)
            colors3 = np.tile([0.9, 0.2, 0.6], (25000, 1))
            pcd3.colors = o3d.utility.Vector3dVector(colors3)
            o3d.io.write_point_cloud(extra_file, pcd3)

        all_files = demo_files + [extra_file]

        task_name = 'NDT_Demo_LoopClosure'
        task_id = create_task(task_name, all_files[0], all_files[-1])
        update_task_status(task_id, 'processing')

        result = register_multiple_stations_optimized(
            all_files,
            voxel_size=0.1,
            distance_threshold=0.3,
            max_iterations=30,
            use_loop_closure=True,
            loop_closure_fitness_threshold=0.3
        )

        for i, fp in enumerate(all_files):
            save_point_cloud_file(
                task_id, fp, 'pcd',
                result.get('total_points', 0),
                is_source=(i == 0)
            )

        save_overlap_heatmap(
            task_id,
            result['heatmap'],
            result['heatmap']['resolution'],
            result['heatmap']['min_overlap'],
            result['heatmap']['max_overlap']
        )

        update_task_status(task_id, 'completed')

        return jsonify({
            'success': True,
            'task_id': task_id,
            'task_name': task_name,
            'num_stations': len(all_files),
            'results': result['results'],
            'metrics': result['metrics'],
            'transformations': result['transformations'],
            'loop_closure': result.get('loop_closure'),
            'quality_assessment': result['quality_assessment'],
            'total_points': result.get('total_points', 0),
            'heatmap': result['heatmap'],
            'warnings': result.get('warnings', []),
            'optimized': result.get('optimized', False)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({
        'status': 'running',
        'upload_folder': UPLOAD_FOLDER,
        'output_folder': OUTPUT_FOLDER,
        'allowed_extensions': list(ALLOWED_EXTENSIONS)
    })


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5001, debug=True)
