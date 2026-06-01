import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lidar_data.db')


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS registration_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_name TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            source_file TEXT,
            target_file TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            error_message TEXT
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS registration_params (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            voxel_size REAL DEFAULT 0.1,
            distance_threshold REAL DEFAULT 0.5,
            max_iterations INTEGER DEFAULT 30,
            tolerance REAL DEFAULT 1e-6,
            translation_x REAL DEFAULT 0.0,
            translation_y REAL DEFAULT 0.0,
            translation_z REAL DEFAULT 0.0,
            rotation_w REAL DEFAULT 1.0,
            rotation_x REAL DEFAULT 0.0,
            rotation_y REAL DEFAULT 0.0,
            rotation_z REAL DEFAULT 0.0,
            fitness REAL DEFAULT 0.0,
            inlier_rmse REAL DEFAULT 0.0,
            correspondence_set_size INTEGER DEFAULT 0,
            transformation_matrix TEXT,
            overlap_before REAL DEFAULT 0.0,
            overlap_after REAL DEFAULT 0.0,
            registration_history TEXT,
            warnings TEXT,
            used_fallback INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES registration_tasks (id)
        )
    ''')

    try:
        cursor.execute('ALTER TABLE registration_params ADD COLUMN overlap_before REAL DEFAULT 0.0')
    except Exception:
        pass
    try:
        cursor.execute('ALTER TABLE registration_params ADD COLUMN overlap_after REAL DEFAULT 0.0')
    except Exception:
        pass
    try:
        cursor.execute('ALTER TABLE registration_params ADD COLUMN registration_history TEXT')
    except Exception:
        pass
    try:
        cursor.execute('ALTER TABLE registration_params ADD COLUMN warnings TEXT')
    except Exception:
        pass
    try:
        cursor.execute('ALTER TABLE registration_params ADD COLUMN used_fallback INTEGER DEFAULT 0')
    except Exception:
        pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS point_cloud_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_type TEXT DEFAULT 'pcd',
            num_points INTEGER DEFAULT 0,
            is_source INTEGER DEFAULT 0,
            transform_applied TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES registration_tasks (id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS overlap_heatmaps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            heatmap_data TEXT NOT NULL,
            resolution INTEGER DEFAULT 64,
            min_dist REAL DEFAULT 0.0,
            max_dist REAL DEFAULT 0.0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES registration_tasks (id)
        )
    ''')

    conn.commit()
    conn.close()


def create_task(task_name, source_file, target_file):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO registration_tasks (task_name, source_file, target_file) VALUES (?, ?, ?)',
        (task_name, source_file, target_file)
    )
    task_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return task_id


def update_task_status(task_id, status, error_message=None):
    conn = get_connection()
    cursor = conn.cursor()
    if error_message:
        cursor.execute(
            'UPDATE registration_tasks SET status = ?, error_message = ?, updated_at = ? WHERE id = ?',
            (status, error_message, datetime.now().isoformat(), task_id)
        )
    else:
        cursor.execute(
            'UPDATE registration_tasks SET status = ?, updated_at = ? WHERE id = ?',
            (status, datetime.now().isoformat(), task_id)
        )
    conn.commit()
    conn.close()


def get_task(task_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM registration_tasks WHERE id = ?', (task_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def get_all_tasks():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM registration_tasks ORDER BY created_at DESC')
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_registration_params(task_id, params, transformation, fitness, inlier_rmse,
                              correspondence_set_size, overlap_before=0.0, overlap_after=0.0,
                              registration_history=None, warnings=None, used_fallback=False):
    conn = get_connection()
    cursor = conn.cursor()
    trans_list = transformation.tolist()
    cursor.execute('''
        INSERT INTO registration_params
        (task_id, voxel_size, distance_threshold, max_iterations, tolerance,
         translation_x, translation_y, translation_z,
         rotation_w, rotation_x, rotation_y, rotation_z,
         fitness, inlier_rmse, correspondence_set_size, transformation_matrix,
         overlap_before, overlap_after, registration_history, warnings, used_fallback)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        task_id,
        params.get('voxel_size', 0.1),
        params.get('distance_threshold', 0.5),
        params.get('max_iterations', 30),
        params.get('tolerance', 1e-6),
        trans_list[0][3], trans_list[1][3], trans_list[2][3],
        trans_list[0][0], trans_list[0][1], trans_list[0][2], trans_list[1][0],
        fitness, inlier_rmse, correspondence_set_size,
        json.dumps(trans_list),
        overlap_before, overlap_after,
        registration_history if registration_history else '[]',
        warnings if warnings else '[]',
        1 if used_fallback else 0
    ))
    conn.commit()
    conn.close()


def get_registration_params(task_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM registration_params WHERE task_id = ? ORDER BY created_at DESC', (task_id,))
    rows = cursor.fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        if d.get('transformation_matrix'):
            d['transformation_matrix'] = json.loads(d['transformation_matrix'])
        if d.get('registration_history'):
            try:
                d['registration_history'] = json.loads(d['registration_history'])
            except Exception:
                d['registration_history'] = []
        if d.get('warnings'):
            try:
                d['warnings'] = json.loads(d['warnings'])
            except Exception:
                d['warnings'] = []
        if d.get('used_fallback') is not None:
            d['used_fallback'] = bool(d['used_fallback'])
        result.append(d)
    return result


def save_point_cloud_file(task_id, file_path, file_type, num_points, is_source, transform_applied=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO point_cloud_files (task_id, file_path, file_type, num_points, is_source, transform_applied)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (task_id, file_path, file_type, num_points, 1 if is_source else 0,
          json.dumps(transform_applied) if transform_applied else None))
    conn.commit()
    conn.close()


def get_point_cloud_files(task_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM point_cloud_files WHERE task_id = ?', (task_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_overlap_heatmap(task_id, heatmap_data, resolution, min_dist, max_dist):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO overlap_heatmaps (task_id, heatmap_data, resolution, min_dist, max_dist)
        VALUES (?, ?, ?, ?, ?)
    ''', (task_id, json.dumps(heatmap_data), resolution, min_dist, max_dist))
    heatmap_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return heatmap_id


def get_overlap_heatmap(task_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM overlap_heatmaps WHERE task_id = ? ORDER BY created_at DESC', (task_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        d = dict(row)
        d['heatmap_data'] = json.loads(d['heatmap_data'])
        return d
    return None
