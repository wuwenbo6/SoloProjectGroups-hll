import sqlite3
import json
from datetime import datetime


class SimulationDatabase:
    def __init__(self, db_path='simulation.db'):
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS simulation_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                temperature REAL NOT NULL,
                pressure REAL NOT NULL,
                epsilon REAL NOT NULL,
                sigma REAL NOT NULL,
                num_particles INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS simulation_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_id INTEGER,
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                steps_completed INTEGER DEFAULT 0,
                FOREIGN KEY (config_id) REFERENCES simulation_configs (id)
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def save_config(self, name, temperature, pressure, epsilon, sigma, num_particles):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO simulation_configs (name, temperature, pressure, epsilon, sigma, num_particles)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (name, temperature, pressure, epsilon, sigma, num_particles))
        
        config_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return config_id
    
    def get_config(self, config_id):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM simulation_configs WHERE id = ?', (config_id,))
        row = cursor.fetchone()
        
        conn.close()
        
        if row:
            return {
                'id': row[0],
                'name': row[1],
                'temperature': row[2],
                'pressure': row[3],
                'epsilon': row[4],
                'sigma': row[5],
                'num_particles': row[6],
                'created_at': row[7]
            }
        return None
    
    def get_all_configs(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM simulation_configs ORDER BY created_at DESC')
        rows = cursor.fetchall()
        
        conn.close()
        
        configs = []
        for row in rows:
            configs.append({
                'id': row[0],
                'name': row[1],
                'temperature': row[2],
                'pressure': row[3],
                'epsilon': row[4],
                'sigma': row[5],
                'num_particles': row[6],
                'created_at': row[7]
            })
        
        return configs
    
    def delete_config(self, config_id):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM simulation_configs WHERE id = ?', (config_id,))
        
        conn.commit()
        conn.close()
    
    def update_config(self, config_id, **kwargs):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        allowed_fields = ['name', 'temperature', 'pressure', 'epsilon', 'sigma', 'num_particles']
        update_fields = [f for f in kwargs.keys() if f in allowed_fields]
        
        if not update_fields:
            conn.close()
            return False
        
        set_clause = ', '.join([f'{f} = ?' for f in update_fields])
        values = [kwargs[f] for f in update_fields]
        values.append(config_id)
        
        cursor.execute(f'UPDATE simulation_configs SET {set_clause} WHERE id = ?', values)
        
        conn.commit()
        conn.close()
        
        return True
