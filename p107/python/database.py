import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict, Optional, Any


class Database:
    def __init__(self, db_path: str = None):
        if db_path is None:
            db_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'can_analyzer.db')
        
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.db_path = db_path
        self._init_tables()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self):
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                config TEXT
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS can_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                timestamp REAL NOT NULL,
                can_id INTEGER NOT NULL,
                data BLOB NOT NULL,
                dlc INTEGER,
                is_extended INTEGER DEFAULT 0,
                FOREIGN KEY (project_id) REFERENCES projects (id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                can_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                start_bit INTEGER NOT NULL,
                bit_length INTEGER NOT NULL,
                is_signed INTEGER DEFAULT 0,
                is_big_endian INTEGER DEFAULT 0,
                scale REAL DEFAULT 1.0,
                offset REAL DEFAULT 0.0,
                unit TEXT,
                is_manual INTEGER DEFAULT 0,
                confidence REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects (id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                can_id INTEGER,
                signal_id INTEGER,
                annotation_type TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects (id),
                FOREIGN KEY (signal_id) REFERENCES signals (id)
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS dbc_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER,
                name TEXT NOT NULL,
                content TEXT,
                file_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects (id)
            )
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_messages_project_id ON can_messages (project_id)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_messages_can_id ON can_messages (can_id)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_signals_project_id ON signals (project_id)
        ''')

        conn.commit()
        conn.close()

    def create_project(self, name: str, description: str = "", config: Dict = None) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        config_json = json.dumps(config) if config else None
        
        cursor.execute(
            'INSERT INTO projects (name, description, config) VALUES (?, ?, ?)',
            (name, description, config_json)
        )
        
        project_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return project_id

    def get_project(self, project_id: int) -> Optional[Dict]:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM projects WHERE id = ?', (project_id,))
        row = cursor.fetchone()
        
        conn.close()
        
        if row:
            result = dict(row)
            if result.get('config'):
                result['config'] = json.loads(result['config'])
            return result
        return None

    def get_all_projects(self) -> List[Dict]:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM projects ORDER BY updated_at DESC')
        rows = cursor.fetchall()
        
        conn.close()
        
        results = []
        for row in rows:
            result = dict(row)
            if result.get('config'):
                result['config'] = json.loads(result['config'])
            results.append(result)
        return results

    def update_project(self, project_id: int, name: str = None, description: str = None, config: Dict = None):
        conn = self._get_connection()
        cursor = conn.cursor()
        
        updates = []
        params = []
        
        if name is not None:
            updates.append('name = ?')
            params.append(name)
        if description is not None:
            updates.append('description = ?')
            params.append(description)
        if config is not None:
            updates.append('config = ?')
            params.append(json.dumps(config))
        
        if updates:
            updates.append('updated_at = CURRENT_TIMESTAMP')
            params.append(project_id)
            
            query = f"UPDATE projects SET {', '.join(updates)} WHERE id = ?"
            cursor.execute(query, params)
        
        conn.commit()
        conn.close()

    def delete_project(self, project_id: int):
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM annotations WHERE project_id = ?', (project_id,))
        cursor.execute('DELETE FROM signals WHERE project_id = ?', (project_id,))
        cursor.execute('DELETE FROM can_messages WHERE project_id = ?', (project_id,))
        cursor.execute('DELETE FROM dbc_files WHERE project_id = ?', (project_id,))
        cursor.execute('DELETE FROM projects WHERE id = ?', (project_id,))
        
        conn.commit()
        conn.close()

    def insert_messages(self, project_id: int, messages: List[Dict]) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        count = 0
        for msg in messages:
            data_bytes = bytes(msg['data'])
            cursor.execute(
                '''INSERT INTO can_messages (project_id, timestamp, can_id, data, dlc, is_extended)
                   VALUES (?, ?, ?, ?, ?, ?)''',
                (project_id, msg['timestamp'], msg['can_id'], data_bytes,
                 msg.get('dlc', len(data_bytes)), 1 if msg.get('is_extended') else 0)
            )
            count += 1
        
        conn.commit()
        conn.close()
        
        return count

    def get_messages(self, project_id: int, can_id: int = None, limit: int = 10000) -> List[Dict]:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        query = 'SELECT * FROM can_messages WHERE project_id = ?'
        params = [project_id]
        
        if can_id is not None:
            query += ' AND can_id = ?'
            params.append(can_id)
        
        query += ' ORDER BY timestamp ASC LIMIT ?'
        params.append(limit)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        conn.close()
        
        results = []
        for row in rows:
            result = dict(row)
            result['data'] = list(result['data'])
            result['is_extended'] = bool(result['is_extended'])
            results.append(result)
        return results

    def get_unique_can_ids(self, project_id: int) -> List[int]:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            'SELECT DISTINCT can_id FROM can_messages WHERE project_id = ? ORDER BY can_id',
            (project_id,)
        )
        rows = cursor.fetchall()
        
        conn.close()
        
        return [row[0] for row in rows]

    def save_signals(self, project_id: int, signals_by_can_id: Dict[int, List[Dict]]):
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM signals WHERE project_id = ? AND is_manual = 0', (project_id,))
        
        for can_id, signals in signals_by_can_id.items():
            for signal in signals:
                cursor.execute(
                    '''INSERT INTO signals 
                       (project_id, can_id, name, start_bit, bit_length, is_signed, 
                        is_big_endian, scale, offset, unit, is_manual, confidence)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (project_id, can_id, signal['name'], signal['start_bit'],
                     signal['bit_length'], 1 if signal.get('is_signed') else 0,
                     1 if signal.get('is_big_endian') else 0,
                     signal.get('scale', 1.0), signal.get('offset', 0.0),
                     signal.get('unit', ''), 0, signal.get('confidence', 0.0))
                )
        
        conn.commit()
        conn.close()

    def get_signals(self, project_id: int, can_id: int = None) -> Dict[int, List[Dict]]:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        query = 'SELECT * FROM signals WHERE project_id = ?'
        params = [project_id]
        
        if can_id is not None:
            query += ' AND can_id = ?'
            params.append(can_id)
        
        query += ' ORDER BY can_id, start_bit'
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        conn.close()
        
        result = {}
        for row in rows:
            signal = dict(row)
            signal['is_signed'] = bool(signal['is_signed'])
            signal['is_big_endian'] = bool(signal['is_big_endian'])
            signal['is_manual'] = bool(signal['is_manual'])
            
            if signal['can_id'] not in result:
                result[signal['can_id']] = []
            result[signal['can_id']].append(signal)
        
        return result

    def add_manual_signal(self, project_id: int, can_id: int, signal_data: Dict) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            '''INSERT INTO signals 
               (project_id, can_id, name, start_bit, bit_length, is_signed, 
                is_big_endian, scale, offset, unit, is_manual)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)''',
            (project_id, can_id, signal_data['name'], signal_data['start_bit'],
             signal_data['bit_length'], 1 if signal_data.get('is_signed') else 0,
             1 if signal_data.get('is_big_endian') else 0,
             signal_data.get('scale', 1.0), signal_data.get('offset', 0.0),
             signal_data.get('unit', ''))
        )
        
        signal_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return signal_id

    def update_signal(self, signal_id: int, signal_data: Dict):
        conn = self._get_connection()
        cursor = conn.cursor()
        
        updates = []
        params = []
        
        fields = ['name', 'start_bit', 'bit_length', 'is_signed', 'is_big_endian',
                  'scale', 'offset', 'unit']
        
        for field in fields:
            if field in signal_data:
                value = signal_data[field]
                if field in ['is_signed', 'is_big_endian']:
                    value = 1 if value else 0
                updates.append(f'{field} = ?')
                params.append(value)
        
        params.append(signal_id)
        
        query = f"UPDATE signals SET {', '.join(updates)} WHERE id = ?"
        cursor.execute(query, params)
        
        conn.commit()
        conn.close()

    def delete_signal(self, signal_id: int):
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM annotations WHERE signal_id = ?', (signal_id,))
        cursor.execute('DELETE FROM signals WHERE id = ?', (signal_id,))
        
        conn.commit()
        conn.close()

    def save_dbc_file(self, project_id: int, name: str, content: str, file_path: str = None) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            'INSERT INTO dbc_files (project_id, name, content, file_path) VALUES (?, ?, ?, ?)',
            (project_id, name, content, file_path)
        )
        
        dbc_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return dbc_id

    def get_dbc_files(self, project_id: int) -> List[Dict]:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            'SELECT * FROM dbc_files WHERE project_id = ? ORDER BY created_at DESC',
            (project_id,)
        )
        rows = cursor.fetchall()
        
        conn.close()
        
        return [dict(row) for row in rows]

    def add_annotation(self, project_id: int, annotation_type: str, key: str, 
                       value: str = None, can_id: int = None, signal_id: int = None) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            '''INSERT INTO annotations (project_id, can_id, signal_id, annotation_type, key, value)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (project_id, can_id, signal_id, annotation_type, key, value)
        )
        
        anno_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return anno_id

    def get_annotations(self, project_id: int, can_id: int = None, signal_id: int = None) -> List[Dict]:
        conn = self._get_connection()
        cursor = conn.cursor()
        
        query = 'SELECT * FROM annotations WHERE project_id = ?'
        params = [project_id]
        
        if can_id is not None:
            query += ' AND can_id = ?'
            params.append(can_id)
        if signal_id is not None:
            query += ' AND signal_id = ?'
            params.append(signal_id)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        conn.close()
        
        return [dict(row) for row in rows]


if __name__ == '__main__':
    db = Database()
    
    project_id = db.create_project("Test Project", "A test project")
    print(f"Created project with ID: {project_id}")
    
    test_messages = [
        {'timestamp': 0.0, 'can_id': 0x100, 'data': [0x01, 0x02, 0x03, 0x04], 'dlc': 4},
        {'timestamp': 0.1, 'can_id': 0x100, 'data': [0x05, 0x06, 0x07, 0x08], 'dlc': 4},
        {'timestamp': 0.2, 'can_id': 0x200, 'data': [0x11, 0x22], 'dlc': 2},
    ]
    
    count = db.insert_messages(project_id, test_messages)
    print(f"Inserted {count} messages")
    
    messages = db.get_messages(project_id)
    print(f"Retrieved {len(messages)} messages")
    
    can_ids = db.get_unique_can_ids(project_id)
    print(f"Unique CAN IDs: {[hex(cid) for cid in can_ids]}")
    
    projects = db.get_all_projects()
    print(f"Total projects: {len(projects)}")
