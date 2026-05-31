import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Optional

class EventLogger:
    def __init__(self, db_path: str = 'events.db'):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS vehicle_states (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                position_x REAL,
                position_y REAL,
                position_z REAL,
                yaw REAL,
                velocity REAL,
                data JSON
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS vehicle_paths (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                waypoint_count INTEGER,
                data JSON
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS conflict_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                vehicle_ids TEXT,
                conflict_x REAL,
                conflict_y REAL,
                severity TEXT,
                resolved BOOLEAN,
                data JSON
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS conflict_resolutions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conflict_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                data JSON
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_vehicle_states_timestamp ON vehicle_states(timestamp)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_conflict_alerts_timestamp ON conflict_alerts(timestamp)
        ''')
        
        conn.commit()
        conn.close()

    def log_vehicle_state(self, state: dict):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO vehicle_states 
            (vehicle_id, timestamp, position_x, position_y, position_z, yaw, velocity, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            state['vehicle_id'],
            state['timestamp'],
            state['position']['x'],
            state['position']['y'],
            state['position']['z'],
            state['orientation']['yaw'],
            state['velocity'],
            json.dumps(state)
        ))
        
        conn.commit()
        conn.close()

    def log_vehicle_path(self, path: dict):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO vehicle_paths (vehicle_id, timestamp, waypoint_count, data)
            VALUES (?, ?, ?, ?)
        ''', (
            path['vehicle_id'],
            path['timestamp'],
            len(path['waypoints']),
            json.dumps(path)
        ))
        
        conn.commit()
        conn.close()

    def log_conflict_alert(self, conflict: dict):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO conflict_alerts 
            (alert_id, timestamp, vehicle_ids, conflict_x, conflict_y, severity, resolved, data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            conflict['alert_id'],
            conflict['timestamp'],
            ','.join(conflict['vehicle_ids']),
            conflict['conflict_position']['x'],
            conflict['conflict_position']['y'],
            conflict['severity'],
            conflict['resolved'],
            json.dumps(conflict)
        ))
        
        conn.commit()
        conn.close()

    def log_conflict_resolution(self, resolution: dict):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO conflict_resolutions (conflict_id, timestamp, data)
            VALUES (?, ?, ?)
        ''', (
            resolution['conflict_id'],
            resolution['timestamp'],
            json.dumps(resolution)
        ))
        
        conn.commit()
        conn.close()

    def get_recent_states(self, limit: int = 100) -> List[Dict]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT data FROM vehicle_states ORDER BY timestamp DESC LIMIT ?
        ''', (limit,))
        
        results = [json.loads(row[0]) for row in cursor.fetchall()]
        conn.close()
        return results

    def get_conflicts(self, severity: Optional[str] = None, limit: int = 100) -> List[Dict]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        if severity:
            cursor.execute('''
                SELECT data FROM conflict_alerts 
                WHERE severity = ? ORDER BY timestamp DESC LIMIT ?
            ''', (severity, limit))
        else:
            cursor.execute('''
                SELECT data FROM conflict_alerts ORDER BY timestamp DESC LIMIT ?
            ''', (limit,))
        
        results = [json.loads(row[0]) for row in cursor.fetchall()]
        conn.close()
        return results

    def get_statistics(self) -> Dict:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM vehicle_states')
        total_states = cursor.fetchone()[0]
        
        cursor.execute('SELECT COUNT(*) FROM conflict_alerts')
        total_conflicts = cursor.fetchone()[0]
        
        cursor.execute('SELECT COUNT(*) FROM conflict_alerts WHERE severity = "critical"')
        critical_conflicts = cursor.fetchone()[0]
        
        cursor.execute('SELECT COUNT(DISTINCT vehicle_id) FROM vehicle_states')
        vehicle_count = cursor.fetchone()[0]
        
        conn.close()
        
        return {
            'total_states_logged': total_states,
            'total_conflicts': total_conflicts,
            'critical_conflicts': critical_conflicts,
            'active_vehicles': vehicle_count
        }
