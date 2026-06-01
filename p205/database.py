import sqlite3
import uuid
from typing import List, Dict, Optional

DB_PATH = "mwl_database.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS worklist (
            id TEXT PRIMARY KEY,
            patient_name TEXT NOT NULL,
            patient_id TEXT,
            patient_birth_date TEXT,
            patient_sex TEXT,
            study_uid TEXT NOT NULL,
            accession_number TEXT,
            study_description TEXT,
            study_date TEXT,
            study_time TEXT,
            modality TEXT,
            modality_in_study TEXT,
            referring_physician TEXT,
            institution_name TEXT,
            station_name TEXT,
            physician_name TEXT,
            procedure_id TEXT,
            procedure_description TEXT,
            requested_proc_id TEXT,
            requested_proc_description TEXT,
            scheduled_date TEXT,
            scheduled_time TEXT,
            scheduled_station_ae TEXT,
            scheduled_performing_physician TEXT,
            scheduled_proc_step_status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def _migrate_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(worklist)")
    existing = {row[1] for row in cursor.fetchall()}
    new_cols = [
        ("patient_birth_date", "TEXT"),
        ("patient_sex", "TEXT"),
        ("study_date", "TEXT"),
        ("study_time", "TEXT"),
        ("modality_in_study", "TEXT"),
        ("institution_name", "TEXT"),
        ("station_name", "TEXT"),
        ("physician_name", "TEXT"),
        ("procedure_id", "TEXT"),
        ("procedure_description", "TEXT"),
        ("requested_proc_id", "TEXT"),
        ("requested_proc_description", "TEXT"),
        ("scheduled_station_ae", "TEXT"),
        ("scheduled_performing_physician", "TEXT"),
        ("scheduled_proc_step_status", "TEXT"),
    ]
    for col_name, col_type in new_cols:
        if col_name not in existing:
            cursor.execute(f"ALTER TABLE worklist ADD COLUMN {col_name} {col_type}")
    conn.commit()
    conn.close()

init_db()
_migrate_db()

def get_all_worklist() -> List[Dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM worklist ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def add_worklist_item(
    patient_name: str,
    study_uid: Optional[str] = None,
    patient_id: Optional[str] = None,
    patient_birth_date: Optional[str] = None,
    patient_sex: Optional[str] = None,
    accession_number: Optional[str] = None,
    study_description: Optional[str] = None,
    study_date: Optional[str] = None,
    study_time: Optional[str] = None,
    modality: Optional[str] = None,
    modality_in_study: Optional[str] = None,
    referring_physician: Optional[str] = None,
    institution_name: Optional[str] = None,
    station_name: Optional[str] = None,
    physician_name: Optional[str] = None,
    procedure_id: Optional[str] = None,
    procedure_description: Optional[str] = None,
    requested_proc_id: Optional[str] = None,
    requested_proc_description: Optional[str] = None,
    scheduled_date: Optional[str] = None,
    scheduled_time: Optional[str] = None,
    scheduled_station_ae: Optional[str] = None,
    scheduled_performing_physician: Optional[str] = None,
    scheduled_proc_step_status: Optional[str] = None,
) -> str:
    if study_uid is None:
        study_uid = "1.2.3.4." + str(uuid.uuid4().int)[:50]
    if scheduled_proc_step_status is None:
        scheduled_proc_step_status = "SCHEDULED"
    item_id = str(uuid.uuid4())
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO worklist (
            id, patient_name, patient_id, patient_birth_date, patient_sex,
            study_uid, accession_number, study_description, study_date, study_time,
            modality, modality_in_study, referring_physician,
            institution_name, station_name, physician_name,
            procedure_id, procedure_description,
            requested_proc_id, requested_proc_description,
            scheduled_date, scheduled_time,
            scheduled_station_ae, scheduled_performing_physician, scheduled_proc_step_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            item_id, patient_name, patient_id, patient_birth_date, patient_sex,
            study_uid, accession_number, study_description, study_date, study_time,
            modality, modality_in_study, referring_physician,
            institution_name, station_name, physician_name,
            procedure_id, procedure_description,
            requested_proc_id, requested_proc_description,
            scheduled_date, scheduled_time,
            scheduled_station_ae, scheduled_performing_physician, scheduled_proc_step_status,
        ),
    )
    conn.commit()
    conn.close()
    return item_id

def delete_worklist_item(item_id: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM worklist WHERE id = ?", (item_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

def _like_value(raw: Optional[str]) -> Optional[str]:
    if raw is None or raw == "" or raw == "*":
        return None
    if "*" in raw or "?" in raw:
        pattern = raw.replace("*", "%").replace("?", "_")
        if not pattern.startswith("%"):
            pattern = "%" + pattern
        if not pattern.endswith("%"):
            pattern = pattern + "%"
        return pattern
    return "%" + raw + "%"

def search_worklist(
    patient_name: Optional[str] = None,
    patient_id: Optional[str] = None,
    study_uid: Optional[str] = None,
    accession_number: Optional[str] = None,
    modality: Optional[str] = None,
    referring_physician: Optional[str] = None,
    institution_name: Optional[str] = None,
    scheduled_date: Optional[str] = None,
    scheduled_station_ae: Optional[str] = None,
    study_description: Optional[str] = None,
) -> List[Dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    query = "SELECT * FROM worklist WHERE 1=1"
    params = []

    like_fields = {
        "patient_name": patient_name,
        "patient_id": patient_id,
        "study_uid": study_uid,
        "accession_number": accession_number,
        "modality": modality,
        "referring_physician": referring_physician,
        "institution_name": institution_name,
        "scheduled_date": scheduled_date,
        "scheduled_station_ae": scheduled_station_ae,
        "study_description": study_description,
    }

    for field, value in like_fields.items():
        pattern = _like_value(value)
        if pattern is not None:
            query += f" AND {field} LIKE ?"
            params.append(pattern)

    query += " ORDER BY created_at DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_worklist_by_id(item_id: str) -> Optional[Dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM worklist WHERE id = ?", (item_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None
