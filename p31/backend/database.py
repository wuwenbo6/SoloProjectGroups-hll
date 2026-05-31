import sqlite3
import json
from datetime import datetime
from contextlib import contextmanager

class Database:
    _conn_cache = None
    
    def __init__(self, db_path="monitoring.db"):
        self.db_path = db_path
        self.conn = None
        if db_path == ":memory:":
            self.conn = sqlite3.connect(db_path)
            self.conn.row_factory = sqlite3.Row
            self._init_db_with_conn(self.conn)
        else:
            self.init_db()
    
    @contextmanager
    def get_connection(self):
        if self.conn is not None:
            try:
                yield self.conn
                self.conn.commit()
            except Exception as e:
                self.conn.rollback()
                raise e
        else:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            try:
                yield conn
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise e
            finally:
                conn.close()
    
    def _init_db_with_conn(self, conn):
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS monitoring_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME NOT NULL,
                frequency REAL,
                phase_a_voltage REAL,
                phase_b_voltage REAL,
                phase_c_voltage REAL,
                phase_angle_a REAL,
                phase_angle_b REAL,
                phase_angle_c REAL,
                thd_a REAL,
                thd_b REAL,
                thd_c REAL,
                avg_thd REAL,
                harmonics_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS waveform_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id INTEGER,
                sample_rate INTEGER,
                duration REAL,
                time_data TEXT,
                phase_a_data TEXT,
                phase_b_data TEXT,
                phase_c_data TEXT,
                FOREIGN KEY (record_id) REFERENCES monitoring_records(id)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS event_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME NOT NULL,
                event_type TEXT,
                description TEXT,
                severity TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
    
    def init_db(self):
        with self.get_connection() as conn:
            self._init_db_with_conn(conn)
    
    def insert_monitoring_record(self, data):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            harmonics_json = json.dumps(data.get('harmonics', {}))
            
            cursor.execute('''
                INSERT INTO monitoring_records (
                    timestamp, frequency, phase_a_voltage, phase_b_voltage, phase_c_voltage,
                    phase_angle_a, phase_angle_b, phase_angle_c,
                    thd_a, thd_b, thd_c, avg_thd, harmonics_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                data.get('timestamp', datetime.now().isoformat()),
                data.get('frequency', 50.0),
                data.get('phase_a_voltage', 0),
                data.get('phase_b_voltage', 0),
                data.get('phase_c_voltage', 0),
                data.get('phase_angle_a', 0),
                data.get('phase_angle_b', 0),
                data.get('phase_angle_c', 0),
                data.get('thd_a', 0),
                data.get('thd_b', 0),
                data.get('thd_c', 0),
                data.get('avg_thd', 0),
                harmonics_json
            ))
            
            return cursor.lastrowid
    
    def insert_waveform_record(self, record_id, waveform_data):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            time_json = json.dumps(waveform_data.get('time', []))
            phase_a_json = json.dumps(waveform_data.get('phase_a', []))
            phase_b_json = json.dumps(waveform_data.get('phase_b', []))
            phase_c_json = json.dumps(waveform_data.get('phase_c', []))
            
            cursor.execute('''
                INSERT INTO waveform_records (
                    record_id, sample_rate, duration,
                    time_data, phase_a_data, phase_b_data, phase_c_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                record_id,
                waveform_data.get('sample_rate', 1000),
                waveform_data.get('duration', 1.0),
                time_json, phase_a_json, phase_b_json, phase_c_json
            ))
            
            return cursor.lastrowid
    
    def get_recent_records(self, limit=100):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM monitoring_records 
                ORDER BY timestamp DESC 
                LIMIT ?
            ''', (limit,))
            
            rows = cursor.fetchall()
            result = []
            for row in rows:
                record = dict(row)
                if record['harmonics_data']:
                    record['harmonics'] = json.loads(record['harmonics_data'])
                result.append(record)
            return result
    
    def get_waveform_by_record_id(self, record_id):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM waveform_records WHERE record_id = ?
            ''', (record_id,))
            
            row = cursor.fetchone()
            if row:
                waveform = dict(row)
                waveform['time'] = json.loads(waveform['time_data'])
                waveform['phase_a'] = json.loads(waveform['phase_a_data'])
                waveform['phase_b'] = json.loads(waveform['phase_b_data'])
                waveform['phase_c'] = json.loads(waveform['phase_c_data'])
                return waveform
            return None
    
    def insert_event_log(self, event_type, description, severity="INFO"):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO event_logs (timestamp, event_type, description, severity)
                VALUES (?, ?, ?, ?)
            ''', (
                datetime.now().isoformat(),
                event_type,
                description,
                severity
            ))
            return cursor.lastrowid
    
    def get_event_logs(self, limit=100):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM event_logs 
                ORDER BY timestamp DESC 
                LIMIT ?
            ''', (limit,))
            
            return [dict(row) for row in cursor.fetchall()]
