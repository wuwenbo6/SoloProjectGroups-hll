import sqlite3
import json
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / 'database' / 'volume_measurements.db'

DEFAULT_MATERIAL_DENSITY = 1.6


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS measurements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            total_volume REAL NOT NULL,
            pile_count INTEGER NOT NULL,
            pile_volumes TEXT NOT NULL,
            point_cloud_path TEXT,
            material_density REAL DEFAULT 1.6,
            total_weight REAL,
            flow_rate REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pile_details (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            measurement_id INTEGER NOT NULL,
            pile_id INTEGER NOT NULL,
            track_id INTEGER,
            volume REAL NOT NULL,
            raw_volume REAL,
            weight REAL,
            centroid_x REAL NOT NULL,
            centroid_y REAL NOT NULL,
            centroid_z REAL NOT NULL,
            FOREIGN KEY (measurement_id) REFERENCES measurements (id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            alert_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            message TEXT NOT NULL,
            measurement_id INTEGER,
            details TEXT,
            acknowledged BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (measurement_id) REFERENCES measurements (id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS flow_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATE NOT NULL,
            hour INTEGER NOT NULL,
            total_volume REAL DEFAULT 0,
            total_weight REAL DEFAULT 0,
            measurement_count INTEGER DEFAULT 0,
            avg_flow_rate REAL DEFAULT 0,
            peak_flow_rate REAL DEFAULT 0,
            UNIQUE(date, hour)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS daily_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATE UNIQUE NOT NULL,
            total_volume REAL DEFAULT 0,
            total_weight REAL DEFAULT 0,
            measurement_count INTEGER DEFAULT 0,
            avg_flow_rate REAL DEFAULT 0,
            peak_flow_rate REAL DEFAULT 0,
            alert_count INTEGER DEFAULT 0,
            pile_count_avg REAL DEFAULT 0,
            generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS system_config (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    
    _init_default_config()


def _init_default_config():
    configs = {
        'material_density': '1.6',
        'volume_change_threshold': '30.0',
        'flow_rate_warning': '100.0',
        'flow_rate_critical': '200.0',
        'alert_cooldown': '60'
    }
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    for key, value in configs.items():
        cursor.execute('''
            INSERT OR IGNORE INTO system_config (key, value) VALUES (?, ?)
        ''', (key, value))
    
    conn.commit()
    conn.close()


def get_config(key, default=None):
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    cursor.execute('SELECT value FROM system_config WHERE key = ?', (key,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else default


def set_config(key, value):
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO system_config (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
    ''', (key, str(value)))
    conn.commit()
    conn.close()


def insert_measurement(total_volume, pile_count, pile_volumes, point_cloud_path=None, 
                       material_density=None, calculate_flow=True):
    if material_density is None:
        material_density = float(get_config('material_density', DEFAULT_MATERIAL_DENSITY))
    
    total_weight = total_volume * material_density
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    timestamp = datetime.now()
    pile_volumes_json = json.dumps(pile_volumes)
    
    flow_rate = None
    if calculate_flow:
        flow_rate = _calculate_flow_rate(cursor, timestamp, total_weight)
    
    cursor.execute('''
        INSERT INTO measurements (timestamp, total_volume, pile_count, pile_volumes, 
                                  point_cloud_path, material_density, total_weight, flow_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (timestamp.isoformat(), total_volume, pile_count, pile_volumes_json, 
          point_cloud_path, material_density, total_weight, flow_rate))
    
    measurement_id = cursor.lastrowid
    
    for pile in pile_volumes:
        weight = pile['volume'] * material_density
        cursor.execute('''
            INSERT INTO pile_details (measurement_id, pile_id, track_id, volume, raw_volume,
                                      weight, centroid_x, centroid_y, centroid_z)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (measurement_id, pile['id'], pile.get('track_id'), pile['volume'],
              pile.get('raw_volume', pile['volume']), weight,
              pile['centroid_x'], pile['centroid_y'], pile['centroid_z']))
    
    _update_flow_stats(cursor, timestamp, total_volume, total_weight, flow_rate)
    
    conn.commit()
    conn.close()
    
    return measurement_id


def _calculate_flow_rate(cursor, current_time, current_weight):
    one_minute_ago = (current_time - timedelta(minutes=1)).isoformat()
    
    cursor.execute('''
        SELECT total_weight, timestamp FROM measurements 
        WHERE timestamp >= ? ORDER BY timestamp ASC LIMIT 1
    ''', (one_minute_ago,))
    
    row = cursor.fetchone()
    if row:
        prev_weight = row[0]
        prev_time = datetime.fromisoformat(row[1])
        time_diff = (current_time - prev_time).total_seconds() / 3600.0
        
        if time_diff > 0:
            weight_diff = current_weight - prev_weight
            return max(0, weight_diff / time_diff)
    
    return 0.0


def _update_flow_stats(cursor, timestamp, volume, weight, flow_rate):
    date_str = timestamp.date().isoformat()
    hour = timestamp.hour
    
    cursor.execute('''
        INSERT INTO flow_stats (date, hour, total_volume, total_weight, 
                                measurement_count, avg_flow_rate, peak_flow_rate)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(date, hour) DO UPDATE SET
            total_volume = total_volume + ?,
            total_weight = total_weight + ?,
            measurement_count = measurement_count + 1,
            avg_flow_rate = (avg_flow_rate * measurement_count + ?) / (measurement_count + 1),
            peak_flow_rate = MAX(peak_flow_rate, ?)
    ''', (date_str, hour, volume, weight, flow_rate, flow_rate,
          volume, weight, flow_rate, flow_rate))


def get_measurements(limit=100):
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT * FROM measurements ORDER BY timestamp DESC LIMIT ?
    ''', (limit,))
    
    rows = cursor.fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item['pile_volumes'] = json.loads(item['pile_volumes'])
        result.append(item)
    
    conn.close()
    return result


def get_measurement(measurement_id):
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM measurements WHERE id = ?', (measurement_id,))
    row = cursor.fetchone()
    
    if row:
        item = dict(row)
        item['pile_volumes'] = json.loads(item['pile_volumes'])
        conn.close()
        return item
    
    conn.close()
    return None


def insert_alert(alert_type, severity, message, measurement_id=None, details=None):
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    cooldown = int(get_config('alert_cooldown', '60'))
    cooldown_time = (datetime.now() - timedelta(seconds=cooldown)).isoformat()
    
    cursor.execute('''
        SELECT id FROM alerts 
        WHERE alert_type = ? AND severity = ? AND timestamp >= ?
        ORDER BY timestamp DESC LIMIT 1
    ''', (alert_type, severity, cooldown_time))
    
    if cursor.fetchone():
        conn.close()
        return None
    
    timestamp = datetime.now().isoformat()
    details_json = json.dumps(details) if details else None
    
    cursor.execute('''
        INSERT INTO alerts (timestamp, alert_type, severity, message, measurement_id, details)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (timestamp, alert_type, severity, message, measurement_id, details_json))
    
    alert_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return alert_id


def get_alerts(limit=100, acknowledged=None):
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    query = 'SELECT * FROM alerts'
    params = []
    
    if acknowledged is not None:
        query += ' WHERE acknowledged = ?'
        params.append(1 if acknowledged else 0)
    
    query += ' ORDER BY timestamp DESC LIMIT ?'
    params.append(limit)
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    result = []
    for row in rows:
        item = dict(row)
        if item['details']:
            item['details'] = json.loads(item['details'])
        result.append(item)
    
    conn.close()
    return result


def acknowledge_alert(alert_id):
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    cursor.execute('UPDATE alerts SET acknowledged = 1 WHERE id = ?', (alert_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


def get_flow_stats(start_date=None, end_date=None):
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    if start_date is None:
        start_date = (datetime.now() - timedelta(days=7)).date().isoformat()
    if end_date is None:
        end_date = datetime.now().date().isoformat()
    
    cursor.execute('''
        SELECT * FROM flow_stats 
        WHERE date BETWEEN ? AND ?
        ORDER BY date DESC, hour DESC
    ''', (start_date, end_date))
    
    rows = cursor.fetchall()
    result = [dict(row) for row in rows]
    conn.close()
    return result


def generate_daily_report(date=None):
    if date is None:
        date = datetime.now().date()
    date_str = date.isoformat()
    
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT 
            COALESCE(SUM(total_volume), 0) as total_volume,
            COALESCE(SUM(total_weight), 0) as total_weight,
            COALESCE(SUM(measurement_count), 0) as measurement_count,
            COALESCE(AVG(avg_flow_rate), 0) as avg_flow_rate,
            COALESCE(MAX(peak_flow_rate), 0) as peak_flow_rate
        FROM flow_stats WHERE date = ?
    ''', (date_str,))
    
    stats = dict(cursor.fetchone())
    
    cursor.execute('SELECT COUNT(*) FROM alerts WHERE DATE(timestamp) = ?', (date_str,))
    alert_count = cursor.fetchone()[0]
    
    cursor.execute('SELECT AVG(pile_count) FROM measurements WHERE DATE(timestamp) = ?', (date_str,))
    pile_count_avg = cursor.fetchone()[0] or 0
    
    cursor.execute('''
        INSERT OR REPLACE INTO daily_reports 
        (date, total_volume, total_weight, measurement_count, avg_flow_rate, 
         peak_flow_rate, alert_count, pile_count_avg, generated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ''', (date_str, stats['total_volume'], stats['total_weight'], 
          stats['measurement_count'], stats['avg_flow_rate'], 
          stats['peak_flow_rate'], alert_count, pile_count_avg))
    
    conn.commit()
    conn.close()
    
    return get_daily_report(date)


def get_daily_report(date=None):
    if date is None:
        date = datetime.now().date()
    date_str = date.isoformat()
    
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM daily_reports WHERE date = ?', (date_str,))
    row = cursor.fetchone()
    conn.close()
    
    return dict(row) if row else None


def get_daily_reports(limit=30):
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM daily_reports ORDER BY date DESC LIMIT ?', (limit,))
    rows = cursor.fetchall()
    
    result = [dict(row) for row in rows]
    conn.close()
    return result


def export_daily_report_csv(date=None, output_path=None):
    if date is None:
        date = datetime.now().date()
    date_str = date.isoformat()
    
    report = generate_daily_report(date)
    if not report:
        return None
    
    if output_path is None:
        output_path = Path(__file__).parent / 'exports' / f'report_{date_str}.csv'
        output_path.parent.mkdir(exist_ok=True)
    
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT * FROM measurements WHERE DATE(timestamp) = ?
        ORDER BY timestamp ASC
    ''', (date_str,))
    measurements = cursor.fetchall()
    
    cursor.execute('''
        SELECT * FROM flow_stats WHERE date = ?
        ORDER BY hour ASC
    ''', (date_str,))
    hourly_stats = cursor.fetchall()
    
    cursor.execute('''
        SELECT * FROM alerts WHERE DATE(timestamp) = ?
        ORDER BY timestamp ASC
    ''', (date_str,))
    alerts = cursor.fetchall()
    
    conn.close()
    
    import csv
    with open(output_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        
        writer.writerow(['='*50])
        writer.writerow(['日报表', date_str])
        writer.writerow(['='*50])
        writer.writerow([])
        
        writer.writerow(['汇总统计'])
        writer.writerow(['-'*20])
        writer.writerow(['总体积 (m³):', f"{report['total_volume']:.4f}"])
        writer.writerow(['总重量 (吨):', f"{report['total_weight']:.4f}"])
        writer.writerow(['测量次数:', report['measurement_count']])
        writer.writerow(['平均流量 (吨/小时):', f"{report['avg_flow_rate']:.2f}"])
        writer.writerow(['峰值流量 (吨/小时):', f"{report['peak_flow_rate']:.2f}"])
        writer.writerow(['报警次数:', report['alert_count']])
        writer.writerow(['平均料堆数:', f"{report['pile_count_avg']:.2f}"])
        writer.writerow([])
        
        writer.writerow(['小时流量统计'])
        writer.writerow(['-'*40])
        writer.writerow(['小时', '体积(m³)', '重量(吨)', '测量次数', '平均流量(吨/小时)'])
        for stat in hourly_stats:
            writer.writerow([
                f"{stat['hour']:02d}:00",
                f"{stat['total_volume']:.4f}",
                f"{stat['total_weight']:.4f}",
                stat['measurement_count'],
                f"{stat['avg_flow_rate']:.2f}"
            ])
        writer.writerow([])
        
        writer.writerow(['报警记录'])
        writer.writerow(['-'*40])
        writer.writerow(['时间', '类型', '级别', '消息'])
        for alert in alerts:
            writer.writerow([alert['timestamp'], alert['alert_type'], 
                           alert['severity'], alert['message']])
        writer.writerow([])
        
        writer.writerow(['详细测量记录'])
        writer.writerow(['-'*60])
        writer.writerow(['时间', '体积(m³)', '重量(吨)', '料堆数', '流量(吨/小时)'])
        for m in measurements:
            writer.writerow([
                m['timestamp'],
                f"{m['total_volume']:.4f}",
                f"{m['total_weight']:.4f}" if m['total_weight'] else 'N/A',
                m['pile_count'],
                f"{m['flow_rate']:.2f}" if m['flow_rate'] else 'N/A'
            ])
    
    return str(output_path)


def delete_measurement(measurement_id):
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM pile_details WHERE measurement_id = ?', (measurement_id,))
    cursor.execute('DELETE FROM measurements WHERE id = ?', (measurement_id,))
    
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    
    return affected > 0
