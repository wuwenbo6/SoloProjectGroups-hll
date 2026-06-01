import sqlite3
import json
import os
from datetime import datetime


class SimulationDatabase:
    def __init__(self, db_path=None):
        if db_path is None:
            db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'simulations.db')
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS simulations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                return_period INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                simulation_time REAL,
                status TEXT DEFAULT 'completed'
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS node_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                simulation_id INTEGER,
                node_id TEXT NOT NULL,
                time TEXT NOT NULL,
                depth REAL,
                flooding REAL,
                elevation REAL,
                lon REAL,
                lat REAL,
                FOREIGN KEY (simulation_id) REFERENCES simulations (id)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS depth_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                simulation_id INTEGER,
                lon REAL NOT NULL,
                lat REAL NOT NULL,
                depth REAL NOT NULL,
                elevation REAL,
                FOREIGN KEY (simulation_id) REFERENCES simulations (id)
            )
        ''')
        
        try:
            cursor.execute('ALTER TABLE node_results ADD COLUMN elevation REAL')
        except sqlite3.OperationalError:
            pass
        
        try:
            cursor.execute('ALTER TABLE depth_points ADD COLUMN elevation REAL')
        except sqlite3.OperationalError:
            pass
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_simulation_return_period ON simulations(return_period)
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_node_results_simulation ON node_results(simulation_id)
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_depth_points_simulation ON depth_points(simulation_id)
        ''')
        
        conn.commit()
        conn.close()
    
    def save_simulation(self, results, depth_points):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        return_period = results['return_period']
        
        cursor.execute('''
            DELETE FROM simulations WHERE return_period = ?
        ''', (return_period,))
        
        cursor.execute('''
            INSERT INTO simulations (return_period, created_at)
            VALUES (?, ?)
        ''', (return_period, datetime.now()))
        
        simulation_id = cursor.lastrowid
        
        node_data = []
        for node in results['nodes']:
            node_data.append((
                simulation_id,
                node['node_id'],
                node['time'],
                node['depth'],
                node['flooding'],
                node.get('elevation'),
                node['lon'],
                node['lat']
            ))
        
        cursor.executemany('''
            INSERT INTO node_results 
            (simulation_id, node_id, time, depth, flooding, elevation, lon, lat)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', node_data)
        
        point_data = []
        for point in depth_points:
            point_data.append((
                simulation_id,
                point['lon'],
                point['lat'],
                point['depth'],
                point.get('elevation')
            ))
        
        if point_data:
            cursor.executemany('''
                INSERT INTO depth_points (simulation_id, lon, lat, depth, elevation)
                VALUES (?, ?, ?, ?, ?)
            ''', point_data)
        
        conn.commit()
        conn.close()
        
        return simulation_id
    
    def get_simulation(self, return_period):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, return_period, created_at FROM simulations 
            WHERE return_period = ?
            ORDER BY created_at DESC LIMIT 1
        ''', (return_period,))
        
        sim_row = cursor.fetchone()
        
        if not sim_row:
            conn.close()
            return None
        
        sim_id = sim_row[0]
        
        cursor.execute('''
            SELECT DISTINCT node_id, 
                   MAX(depth) as max_depth, 
                   MAX(flooding) as max_flooding,
                   MAX(elevation) as elevation,
                   lon, lat
            FROM node_results 
            WHERE simulation_id = ?
            GROUP BY node_id, lon, lat
        ''', (sim_id,))
        
        nodes = []
        for row in cursor.fetchall():
            nodes.append({
                'node_id': row[0],
                'max_depth': row[1],
                'max_flooding': row[2],
                'elevation': row[3],
                'lon': row[4],
                'lat': row[5]
            })
        
        cursor.execute('''
            SELECT lon, lat, depth, elevation FROM depth_points 
            WHERE simulation_id = ?
        ''', (sim_id,))
        
        depth_points = []
        for row in cursor.fetchall():
            dp = {
                'lon': row[0],
                'lat': row[1],
                'depth': row[2],
                'elevation': row[3]
            }
            if dp['elevation'] is None:
                del dp['elevation']
            depth_points.append(dp)
        
        conn.close()
        
        return {
            'simulation_id': sim_id,
            'return_period': sim_row[1],
            'created_at': sim_row[2],
            'nodes': nodes,
            'depth_points': depth_points
        }
    
    def get_available_return_periods(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT DISTINCT return_period FROM simulations 
            ORDER BY return_period
        ''')
        
        periods = [row[0] for row in cursor.fetchall()]
        conn.close()
        
        return periods
    
    def delete_simulation(self, return_period):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id FROM simulations WHERE return_period = ?
        ''', (return_period,))
        
        sim_ids = [row[0] for row in cursor.fetchall()]
        
        for sim_id in sim_ids:
            cursor.execute('DELETE FROM node_results WHERE simulation_id = ?', (sim_id,))
            cursor.execute('DELETE FROM depth_points WHERE simulation_id = ?', (sim_id,))
        
        cursor.execute('DELETE FROM simulations WHERE return_period = ?', (return_period,))
        
        conn.commit()
        conn.close()
        
        return len(sim_ids)
