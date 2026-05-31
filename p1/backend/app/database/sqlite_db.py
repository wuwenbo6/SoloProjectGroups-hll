import sqlite3
import json
import os
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "tanks.db")


class TankDatabase:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    @contextmanager
    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self):
        with self._get_connection() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS tanks (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    max_height REAL NOT NULL,
                    sensor_height REAL NOT NULL,
                    min_level REAL NOT NULL DEFAULT 0,
                    max_level REAL NOT NULL,
                    location TEXT,
                    status TEXT DEFAULT 'offline',
                    calibration_offset REAL DEFAULT 0,
                    calibration_scale REAL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS tank_runtime (
                    tank_id TEXT PRIMARY KEY,
                    current_level REAL,
                    current_temperature REAL,
                    last_update TEXT,
                    FOREIGN KEY (tank_id) REFERENCES tanks(id) ON DELETE CASCADE
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS calibrations (
                    id TEXT PRIMARY KEY,
                    tank_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    status TEXT DEFAULT 'pending',
                    result_offset REAL,
                    result_scale REAL,
                    result_r_squared REAL,
                    result_mean_error REAL,
                    result_max_error REAL,
                    created_at TEXT NOT NULL,
                    completed_at TEXT,
                    FOREIGN KEY (tank_id) REFERENCES tanks(id) ON DELETE CASCADE
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS calibration_points (
                    id TEXT PRIMARY KEY,
                    calibration_id TEXT NOT NULL,
                    tank_id TEXT NOT NULL,
                    measured_level REAL NOT NULL,
                    actual_level REAL NOT NULL,
                    temperature REAL DEFAULT 25,
                    error REAL NOT NULL,
                    note TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (calibration_id) REFERENCES calibrations(id) ON DELETE CASCADE,
                    FOREIGN KEY (tank_id) REFERENCES tanks(id) ON DELETE CASCADE
                )
            ''')

    def create_tank(self, tank_data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_connection() as conn:
            conn.execute(
                '''INSERT INTO tanks 
                   (id, name, description, max_height, sensor_height, min_level, 
                    max_level, location, status, calibration_offset, calibration_scale, 
                    created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    tank_data['id'],
                    tank_data['name'],
                    tank_data.get('description'),
                    tank_data['max_height'],
                    tank_data['sensor_height'],
                    tank_data.get('min_level', 0),
                    tank_data['max_level'],
                    tank_data.get('location'),
                    tank_data.get('status', 'offline'),
                    tank_data.get('calibration_offset', 0),
                    tank_data.get('calibration_scale', 1),
                    tank_data['created_at'].isoformat() if isinstance(tank_data['created_at'], datetime) else tank_data['created_at'],
                    tank_data['updated_at'].isoformat() if isinstance(tank_data['updated_at'], datetime) else tank_data['updated_at']
                )
            )
        return tank_data

    def get_tank(self, tank_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                '''SELECT t.*, r.current_level, r.current_temperature, r.last_update
                   FROM tanks t 
                   LEFT JOIN tank_runtime r ON t.id = r.tank_id
                   WHERE t.id = ?''',
                (tank_id,)
            )
            row = cursor.fetchone()
            return self._row_to_dict(row) if row else None

    def get_all_tanks(self) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                '''SELECT t.*, r.current_level, r.current_temperature, r.last_update
                   FROM tanks t 
                   LEFT JOIN tank_runtime r ON t.id = r.tank_id
                   ORDER BY t.created_at DESC'''
            )
            return [self._row_to_dict(row) for row in cursor.fetchall()]

    def update_tank(self, tank_id: str, update_data: Dict[str, Any]) -> bool:
        if not update_data:
            return False
        
        set_clause = ", ".join([f"{k} = ?" for k in update_data.keys()])
        values = list(update_data.values()) + [tank_id]
        
        with self._get_connection() as conn:
            result = conn.execute(
                f'UPDATE tanks SET {set_clause}, updated_at = ? WHERE id = ?',
                values[:-1] + [datetime.utcnow().isoformat(), tank_id]
            )
            return result.rowcount > 0

    def delete_tank(self, tank_id: str) -> bool:
        with self._get_connection() as conn:
            conn.execute('DELETE FROM tank_runtime WHERE tank_id = ?', (tank_id,))
            result = conn.execute('DELETE FROM tanks WHERE id = ?', (tank_id,))
            return result.rowcount > 0

    def update_runtime(self, tank_id: str, level: float, temperature: float, status: str) -> bool:
        with self._get_connection() as conn:
            result = conn.execute(
                'INSERT OR REPLACE INTO tank_runtime (tank_id, current_level, current_temperature, last_update) VALUES (?, ?, ?, ?)',
                (tank_id, level, temperature, datetime.utcnow().isoformat())
            )
            conn.execute(
                'UPDATE tanks SET status = ?, updated_at = ? WHERE id = ?',
                (status, datetime.utcnow().isoformat(), tank_id)
            )
            return result.rowcount > 0

    def has_any_tank(self) -> bool:
        with self._get_connection() as conn:
            cursor = conn.execute('SELECT COUNT(*) as count FROM tanks')
            row = cursor.fetchone()
            return row['count'] > 0

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        data = dict(row)
        
        for key in ['created_at', 'updated_at', 'last_update', 'completed_at']:
            if data.get(key):
                try:
                    data[key] = datetime.fromisoformat(data[key])
                except (ValueError, TypeError):
                    pass
        
        return data

    def create_calibration(self, calib_data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_connection() as conn:
            calib_id = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()
            conn.execute(
                '''INSERT INTO calibrations 
                   (id, tank_id, name, description, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)''',
                (
                    calib_id,
                    calib_data['tank_id'],
                    calib_data['name'],
                    calib_data.get('description'),
                    'pending',
                    now
                )
            )
            return self.get_calibration(calib_id)

    def get_calibration(self, calib_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                'SELECT * FROM calibrations WHERE id = ?',
                (calib_id,)
            )
            row = cursor.fetchone()
            if not row:
                return None
            
            data = self._row_to_dict(row)
            data['points'] = self.get_calibration_points(calib_id)
            return data

    def get_calibrations_by_tank(self, tank_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                'SELECT * FROM calibrations WHERE tank_id = ? ORDER BY created_at DESC',
                (tank_id,)
            )
            result = []
            for row in cursor.fetchall():
                data = self._row_to_dict(row)
                data['points'] = self.get_calibration_points(data['id'])
                result.append(data)
            return result

    def add_calibration_point(self, calib_id: str, point_data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_connection() as conn:
            point_id = str(uuid.uuid4())
            error = point_data['actual_level'] - point_data['measured_level']
            conn.execute(
                '''INSERT INTO calibration_points 
                   (id, calibration_id, tank_id, measured_level, actual_level, 
                    temperature, error, note, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    point_id,
                    calib_id,
                    point_data['tank_id'],
                    point_data['measured_level'],
                    point_data['actual_level'],
                    point_data.get('temperature', 25.0),
                    error,
                    point_data.get('note'),
                    datetime.utcnow().isoformat()
                )
            )
            return self.get_calibration_point(point_id)

    def get_calibration_point(self, point_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                'SELECT * FROM calibration_points WHERE id = ?',
                (point_id,)
            )
            row = cursor.fetchone()
            return self._row_to_dict(row) if row else None

    def get_calibration_points(self, calib_id: str) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                'SELECT * FROM calibration_points WHERE calibration_id = ? ORDER BY created_at',
                (calib_id,)
            )
            return [self._row_to_dict(row) for row in cursor.fetchall()]

    def complete_calibration(self, calib_id: str, result: Dict[str, Any]) -> bool:
        with self._get_connection() as conn:
            result = conn.execute(
                '''UPDATE calibrations SET 
                   status = 'completed',
                   result_offset = ?,
                   result_scale = ?,
                   result_r_squared = ?,
                   result_mean_error = ?,
                   result_max_error = ?,
                   completed_at = ?
                   WHERE id = ?''',
                (
                    result['offset'],
                    result['scale_factor'],
                    result['r_squared'],
                    result['mean_error'],
                    result['max_error'],
                    datetime.utcnow().isoformat(),
                    calib_id
                )
            )
            return result.rowcount > 0

    def apply_calibration_to_tank(self, tank_id: str, offset: float, scale: float) -> bool:
        with self._get_connection() as conn:
            result = conn.execute(
                '''UPDATE tanks SET 
                   calibration_offset = ?,
                   calibration_scale = ?,
                   updated_at = ?
                   WHERE id = ?''',
                (offset, scale, datetime.utcnow().isoformat(), tank_id)
            )
            return result.rowcount > 0

    def delete_calibration(self, calib_id: str) -> bool:
        with self._get_connection() as conn:
            conn.execute('DELETE FROM calibration_points WHERE calibration_id = ?', (calib_id,))
            result = conn.execute('DELETE FROM calibrations WHERE id = ?', (calib_id,))
            return result.rowcount > 0


tank_db = TankDatabase()


def get_tank_db():
    return tank_db
