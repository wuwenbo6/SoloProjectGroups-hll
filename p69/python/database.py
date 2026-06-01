import sqlite3
import os
import json
from datetime import datetime


class SteganographyDatabase:
    def __init__(self, db_path=None):
        if db_path is None:
            db_path = os.path.join(os.path.dirname(__file__), 'steganography.db')
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_type TEXT NOT NULL,
                audio_path TEXT NOT NULL,
                image_path TEXT,
                output_path TEXT,
                timestamp DATETIME NOT NULL,
                success BOOLEAN NOT NULL,
                details TEXT
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def add_record(self, operation_type, audio_path, image_path=None, 
                   output_path=None, success=True, details=None):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO records (operation_type, audio_path, image_path, 
                               output_path, timestamp, success, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            operation_type,
            audio_path,
            image_path,
            output_path,
            datetime.now().isoformat(),
            success,
            json.dumps(details) if details else None
        ))
        
        record_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return record_id
    
    def get_records(self, limit=100, offset=0):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM records 
            ORDER BY timestamp DESC 
            LIMIT ? OFFSET ?
        ''', (limit, offset))
        
        rows = cursor.fetchall()
        conn.close()
        
        records = []
        for row in rows:
            record = dict(row)
            if record['details']:
                record['details'] = json.loads(record['details'])
            records.append(record)
        
        return records
    
    def get_record_by_id(self, record_id):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM records WHERE id = ?', (record_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            record = dict(row)
            if record['details']:
                record['details'] = json.loads(record['details'])
            return record
        return None
    
    def search_records(self, keyword=None, operation_type=None, 
                       success=None, limit=100):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        query = 'SELECT * FROM records WHERE 1=1'
        params = []
        
        if keyword:
            query += ' AND (audio_path LIKE ? OR image_path LIKE ? OR output_path LIKE ?)'
            params.extend([f'%{keyword}%'] * 3)
        
        if operation_type:
            query += ' AND operation_type = ?'
            params.append(operation_type)
        
        if success is not None:
            query += ' AND success = ?'
            params.append(success)
        
        query += ' ORDER BY timestamp DESC LIMIT ?'
        params.append(limit)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        records = []
        for row in rows:
            record = dict(row)
            if record['details']:
                record['details'] = json.loads(record['details'])
            records.append(record)
        
        return records
    
    def delete_record(self, record_id):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM records WHERE id = ?', (record_id,))
        deleted = cursor.rowcount > 0
        
        conn.commit()
        conn.close()
        
        return deleted


def main():
    import sys
    
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No command specified'}))
        return
    
    command = sys.argv[1]
    db = SteganographyDatabase()
    
    try:
        if command == 'add':
            operation_type = sys.argv[2]
            audio_path = sys.argv[3]
            image_path = sys.argv[4] if len(sys.argv) > 4 else None
            output_path = sys.argv[5] if len(sys.argv) > 5 else None
            record_id = db.add_record(operation_type, audio_path, image_path, output_path)
            print(json.dumps({'success': True, 'record_id': record_id}))
        
        elif command == 'list':
            limit = int(sys.argv[2]) if len(sys.argv) > 2 else 100
            records = db.get_records(limit)
            print(json.dumps({'success': True, 'records': records}, default=str))
        
        elif command == 'get':
            record_id = int(sys.argv[2])
            record = db.get_record_by_id(record_id)
            print(json.dumps({'success': True, 'record': record}, default=str))
        
        elif command == 'search':
            keyword = sys.argv[2] if len(sys.argv) > 2 else None
            records = db.search_records(keyword=keyword)
            print(json.dumps({'success': True, 'records': records}, default=str))
        
        elif command == 'delete':
            record_id = int(sys.argv[2])
            result = db.delete_record(record_id)
            print(json.dumps({'success': result}))
        
        else:
            print(json.dumps({'error': f'Unknown command: {command}'}))
    
    except Exception as e:
        print(json.dumps({'error': str(e)}, default=str))


if __name__ == '__main__':
    main()
