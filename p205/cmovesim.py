import sqlite3
import uuid
from datetime import datetime
from typing import List, Dict, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = "devices.db"

def init_devices_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            ae_title TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            modality TEXT,
            station_name TEXT,
            description TEXT,
            last_connection TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def init_push_history_db():
    conn = sqlite3.connect("push_history.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS push_history (
            id TEXT PRIMARY KEY,
            worklist_item_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT,
            pushed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def get_all_devices():
    init_devices_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM devices ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def add_device(ae_title: str, host: str, port: int, modality: Optional[str] = None, station_name: Optional[str] = None, description: Optional[str] = None):
    init_devices_db()
    device_id = str(uuid.uuid4())
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO devices (id, ae_title, host, port, modality, station_name, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (device_id, ae_title, host, port, modality, station_name, description))
    conn.commit()
    conn.close()
    return device_id

def delete_device(device_id: str):
    init_devices_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM devices WHERE id = ?", (device_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

def get_device_by_id(device_id: str):
    init_devices_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM devices WHERE id = ?", (device_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_device_by_ae(ae_title: str):
    init_devices_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM devices WHERE ae_title = ?", (ae_title,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def record_push_history(worklist_item_id: str, device_id: str, status: str, message: str = ""):
    init_push_history_db()
    history_id = str(uuid.uuid4())
    conn = sqlite3.connect("push_history.db")
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO push_history (id, worklist_item_id, device_id, status, message)
        VALUES (?, ?, ?, ?, ?)
    """, (history_id, worklist_item_id, device_id, status, message))
    conn.commit()
    conn.close()
    return history_id

def get_push_history(worklist_item_id: Optional[str] = None, device_id: Optional[str] = None):
    init_push_history_db()
    conn = sqlite3.connect("push_history.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    query = "SELECT * FROM push_history WHERE 1=1"
    params = []
    if worklist_item_id:
        query += " AND worklist_item_id = ?"
        params.append(worklist_item_id)
    if device_id:
        query += " AND device_id = ?"
        params.append(device_id)
    query += " ORDER BY pushed_at DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def simulate_c_move_push(worklist_item: Dict, device: Dict) -> Dict:
    logger.info(f"Simulating C-MOVE push to device: " + device['ae_title'] + " (" + device['host'] + ":" + str(device['port']) + ")")
    logger.info(f"Pushing worklist item: " + worklist_item.get('patient_name', 'Unknown'))

    result = {
        'success': True,
        'status': 'COMPLETED',
        'message': 'C-MOVE simulation completed successfully',
        'details': {
            'device_ae': device['ae_title'],
            'device_host': device['host'],
            'device_port': device['port'],
            'patient_name': worklist_item.get('patient_name'),
            'study_uid': worklist_item.get('study_uid'),
            'pushed_at': datetime.now().isoformat()
        }
    }
    
    record_push_history(
        worklist_item.get('id', ''),
        device.get('id', ''),
        result['status'],
        result['message']
    )
    
    logger.info("Push simulation result: " + str(result))
    return result

def push_to_all_devices(worklist_item: Dict, devices: Optional[List[Dict]] = None) -> List[Dict]:
    if devices is None:
        devices = get_all_devices()
    
    results = []
    for device in devices:
        try:
            result = simulate_c_move_push(worklist_item, device)
            results.append(result)
        except Exception as e:
            logger.error("Error pushing to device " + device.get('ae_title', 'Unknown') + ": " + str(e))
            results.append({
                'success': False,
                'status': 'FAILED',
                'message': str(e),
                'details': {'device_ae': device.get('ae_title')}
            })
    
    return results

def push_to_device(worklist_item: Dict, device_id: str) -> Dict:
    device = get_device_by_id(device_id)
    if not device:
        return {
            'success': False,
            'status': 'FAILED',
            'message': 'Device not found'
        }
    return simulate_c_move_push(worklist_item, device)

def push_to_device_by_ae(worklist_item: Dict, ae_title: str) -> Dict:
    device = get_device_by_ae(ae_title)
    if not device:
        return simulate_c_move_push(worklist_item, device)
    return {
        'success': False,
        'status': 'FAILED',
        'message': 'Device not found'
    }

if __name__ == "__main__":
    init_devices_db()
    init_push_history_db()
    print("C-MOVE Simulation module initialized")
    print("Devices:")
    for d in get_all_devices():
        print("  - " + d['ae_title'] + " @ " + d['host'] + ":" + str(d['port']))
