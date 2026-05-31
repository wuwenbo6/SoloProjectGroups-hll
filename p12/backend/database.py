import sqlite3
from contextlib import contextmanager
from config import Config
import json

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS uploaded_files (
                id VARCHAR(255) PRIMARY KEY,
                file_name VARCHAR(255) NOT NULL,
                file_path VARCHAR(512) NOT NULL,
                file_size INTEGER,
                point_count INTEGER,
                status VARCHAR(20) DEFAULT 'uploaded',
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS detection_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id VARCHAR(255) NOT NULL,
                file_name VARCHAR(255) NOT NULL,
                class_name VARCHAR(50) NOT NULL,
                confidence FLOAT NOT NULL,
                x FLOAT NOT NULL,
                y FLOAT NOT NULL,
                z FLOAT NOT NULL,
                w FLOAT NOT NULL,
                h FLOAT NOT NULL,
                l FLOAT NOT NULL,
                rotation_y FLOAT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (file_id) REFERENCES uploaded_files(id)
            )
        ''')
        
        conn.commit()

@contextmanager
def get_db():
    conn = sqlite3.connect(Config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def insert_file(file_id, file_name, file_path, file_size, point_count):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO uploaded_files (id, file_name, file_path, file_size, point_count, status)
            VALUES (?, ?, ?, ?, ?, 'uploaded')
        ''', (file_id, file_name, file_path, file_size, point_count))
        conn.commit()

def update_file_status(file_id, status):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE uploaded_files SET status = ? WHERE id = ?
        ''', (status, file_id))
        conn.commit()

def get_file(file_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM uploaded_files WHERE id = ?', (file_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_all_files():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM uploaded_files ORDER BY uploaded_at DESC')
        return [dict(row) for row in cursor.fetchall()]

def delete_file(file_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM detection_results WHERE file_id = ?', (file_id,))
        cursor.execute('DELETE FROM uploaded_files WHERE id = ?', (file_id,))
        conn.commit()

def insert_detection(file_id, file_name, class_name, confidence, bbox):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO detection_results 
            (file_id, file_name, class_name, confidence, x, y, z, w, h, l, rotation_y)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (file_id, file_name, class_name, confidence,
              bbox['x'], bbox['y'], bbox['z'],
              bbox['w'], bbox['h'], bbox['l'],
              bbox.get('rotation_y', 0)))
        conn.commit()
        return cursor.lastrowid

def get_detections_by_file(file_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM detection_results WHERE file_id = ? ORDER BY confidence DESC', (file_id,))
        return [dict(row) for row in cursor.fetchall()]

def get_all_detections():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM detection_results ORDER BY created_at DESC')
        return [dict(row) for row in cursor.fetchall()]

def delete_detection(detection_id):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM detection_results WHERE id = ?', (detection_id,))
        conn.commit()
