import json
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional

DB_PATH = Path(__file__).parent / "xr_data.db"

_CREATE_REPORT_TABLE = """
CREATE TABLE IF NOT EXISTS xr_report (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    ssrc INTEGER NOT NULL,
    loss_rate REAL NOT NULL DEFAULT 0,
    discard_rate REAL NOT NULL DEFAULT 0,
    jitter_buffer_delay REAL NOT NULL DEFAULT 0,
    mos_cq REAL NOT NULL DEFAULT 0,
    mos_lq REAL NOT NULL DEFAULT 0,
    r_factor REAL NOT NULL DEFAULT 0,
    mos_p564 REAL NOT NULL DEFAULT 0,
    codec TEXT NOT NULL DEFAULT 'G.711',
    raw_hex TEXT
);
"""

_ALTER_REPORT_TABLE_1 = "ALTER TABLE xr_report ADD COLUMN mos_p564 REAL NOT NULL DEFAULT 0"
_ALTER_REPORT_TABLE_2 = "ALTER TABLE xr_report ADD COLUMN codec TEXT NOT NULL DEFAULT 'G.711'"

_CREATE_BLOCK_TABLE = """
CREATE TABLE IF NOT EXISTS xr_block (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    block_type INTEGER NOT NULL,
    block_type_name TEXT NOT NULL,
    fields_json TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES xr_report(id)
);
"""

_CREATE_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_xr_report_timestamp ON xr_report(timestamp);",
    "CREATE INDEX IF NOT EXISTS idx_xr_report_ssrc ON xr_report(ssrc);",
]


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cursor = conn.execute(f"PRAGMA table_info({table})")
    columns = [row[1] for row in cursor.fetchall()]
    return column in columns


def init_db():
    conn = _get_conn()
    try:
        conn.execute(_CREATE_REPORT_TABLE)
        conn.execute(_CREATE_BLOCK_TABLE)
        for idx_sql in _CREATE_INDEXES:
            conn.execute(idx_sql)

        if not _column_exists(conn, "xr_report", "mos_p564"):
            try:
                conn.execute(_ALTER_REPORT_TABLE_1)
            except sqlite3.OperationalError:
                pass

        if not _column_exists(conn, "xr_report", "codec"):
            try:
                conn.execute(_ALTER_REPORT_TABLE_2)
            except sqlite3.OperationalError:
                pass

        conn.commit()
    finally:
        conn.close()


def insert_report(ssrc: int, loss_rate: float, discard_rate: float,
                  jitter_buffer_delay: float, mos_cq: float, mos_lq: float,
                  r_factor: float, raw_hex: str, blocks: List[dict],
                  timestamp: Optional[str] = None,
                  mos_p564: float = 0,
                  codec: str = "G.711") -> int:
    conn = _get_conn()
    try:
        if timestamp:
            cursor = conn.execute(
                "INSERT INTO xr_report (timestamp, ssrc, loss_rate, discard_rate, jitter_buffer_delay, mos_cq, mos_lq, r_factor, raw_hex, mos_p564, codec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (timestamp, ssrc, loss_rate, discard_rate, jitter_buffer_delay, mos_cq, mos_lq, r_factor, raw_hex, mos_p564, codec),
            )
        else:
            cursor = conn.execute(
                "INSERT INTO xr_report (ssrc, loss_rate, discard_rate, jitter_buffer_delay, mos_cq, mos_lq, r_factor, raw_hex, mos_p564, codec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (ssrc, loss_rate, discard_rate, jitter_buffer_delay, mos_cq, mos_lq, r_factor, raw_hex, mos_p564, codec),
            )
        report_id = cursor.lastrowid

        for block in blocks:
            fields = block.get("fields", {})
            conn.execute(
                "INSERT INTO xr_block (report_id, block_type, block_type_name, fields_json) VALUES (?, ?, ?, ?)",
                (report_id, block.get("block_type", 0), block.get("block_type_name", ""), json.dumps(fields)),
            )
        conn.commit()
        return report_id
    finally:
        conn.close()


def _row_to_report(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "timestamp": row["timestamp"],
        "ssrc": row["ssrc"],
        "loss_rate": row["loss_rate"],
        "discard_rate": row["discard_rate"],
        "jitter_buffer_delay": row["jitter_buffer_delay"],
        "mos_cq": row["mos_cq"],
        "mos_lq": row["mos_lq"],
        "r_factor": row["r_factor"],
        "mos_p564": row["mos_p564"] if "mos_p564" in row.keys() else 0,
        "codec": row["codec"] if "codec" in row.keys() else "G.711",
    }


def get_trend(hours: int = 24) -> dict:
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT timestamp, loss_rate, jitter_buffer_delay, mos_cq, mos_p564 FROM xr_report WHERE timestamp >= datetime('now', ?) ORDER BY timestamp ASC",
            (f"-{hours} hours",),
        ).fetchall()
        return {
            "timestamps": [r["timestamp"] for r in rows],
            "loss_rates": [r["loss_rate"] for r in rows],
            "jitter_delays": [r["jitter_buffer_delay"] for r in rows],
            "mos_scores": [r["mos_cq"] for r in rows],
            "mos_p564_scores": [r["mos_p564"] if "mos_p564" in r.keys() else 0 for r in rows],
        }
    finally:
        conn.close()


def get_history(page: int = 1, page_size: int = 20) -> dict:
    conn = _get_conn()
    try:
        total = conn.execute("SELECT COUNT(*) FROM xr_report").fetchone()[0]
        offset = (page - 1) * page_size
        rows = conn.execute(
            "SELECT * FROM xr_report ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            (page_size, offset),
        ).fetchall()
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "records": [_row_to_report(r) for r in rows],
        }
    finally:
        conn.close()


def get_detail(report_id: int) -> Optional[dict]:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT * FROM xr_report WHERE id = ?", (report_id,)).fetchone()
        if not row:
            return None
        report = _row_to_report(row)
        block_rows = conn.execute("SELECT * FROM xr_block WHERE report_id = ?", (report_id,)).fetchall()
        report["report_blocks"] = [
            {
                "block_type": br["block_type"],
                "block_type_name": br["block_type_name"],
                "fields": json.loads(br["fields_json"]),
            }
            for br in block_rows
        ]
        return report
    finally:
        conn.close()


def get_latest_metrics() -> Optional[dict]:
    conn = _get_conn()
    try:
        row = conn.execute("SELECT * FROM xr_report ORDER BY timestamp DESC LIMIT 1").fetchone()
        if not row:
            return None
        return _row_to_report(row)
    finally:
        conn.close()


def get_ssrc_list() -> List[dict]:
    conn = _get_conn()
    try:
        rows = conn.execute("""
            SELECT ssrc, 
                   MIN(timestamp) as first_seen,
                   MAX(timestamp) as last_seen,
                   COUNT(*) as record_count
            FROM xr_report 
            GROUP BY ssrc 
            ORDER BY last_seen DESC
        """).fetchall()
        return [
            {
                "ssrc": r["ssrc"],
                "ssrc_hex": "0x" + format(r["ssrc"], "08X"),
                "first_seen": r["first_seen"],
                "last_seen": r["last_seen"],
                "record_count": r["record_count"],
            }
            for r in rows
        ]
    finally:
        conn.close()


def get_trend_by_ssrc(ssrc: int, hours: int = 24) -> dict:
    conn = _get_conn()
    try:
        rows = conn.execute(
            """
            SELECT timestamp, loss_rate, jitter_buffer_delay, mos_cq, mos_p564, codec
            FROM xr_report 
            WHERE ssrc = ? AND timestamp >= datetime('now', ?) 
            ORDER BY timestamp ASC
            """,
            (ssrc, f"-{hours} hours"),
        ).fetchall()
        return {
            "ssrc": ssrc,
            "ssrc_hex": "0x" + format(ssrc, "08X"),
            "timestamps": [r["timestamp"] for r in rows],
            "loss_rates": [r["loss_rate"] for r in rows],
            "jitter_delays": [r["jitter_buffer_delay"] for r in rows],
            "mos_scores": [r["mos_cq"] for r in rows],
            "mos_p564_scores": [r["mos_p564"] if "mos_p564" in r.keys() else 0 for r in rows],
            "codec": rows[0]["codec"] if rows else None,
        }
    finally:
        conn.close()


def get_call_summary(ssrc: Optional[int] = None, hours: int = 24) -> dict:
    conn = _get_conn()
    try:
        sql = """
            SELECT 
                AVG(loss_rate) as avg_loss_rate,
                MAX(loss_rate) as max_loss_rate,
                MIN(loss_rate) as min_loss_rate,
                AVG(jitter_buffer_delay) as avg_jitter,
                MAX(jitter_buffer_delay) as max_jitter,
                AVG(mos_cq) as avg_mos_cq,
                MIN(mos_cq) as min_mos_cq,
                AVG(mos_p564) as avg_mos_p564,
                AVG(r_factor) as avg_r_factor,
                MIN(r_factor) as min_r_factor,
                COUNT(*) as record_count,
                MIN(timestamp) as period_start,
                MAX(timestamp) as period_end
            FROM xr_report 
            WHERE timestamp >= datetime('now', ?)
        """
        params = [f"-{hours} hours"]
        
        if ssrc is not None:
            sql += " AND ssrc = ?"
            params.append(ssrc)
        
        row = conn.execute(sql, params).fetchone()
        
        return {
            "ssrc": ssrc,
            "ssrc_hex": "0x" + format(ssrc, "08X") if ssrc else None,
            "hours": hours,
            "avg_loss_rate": round(row["avg_loss_rate"] or 0, 2),
            "max_loss_rate": round(row["max_loss_rate"] or 0, 2),
            "min_loss_rate": round(row["min_loss_rate"] or 0, 2),
            "avg_jitter": round(row["avg_jitter"] or 0, 1),
            "max_jitter": round(row["max_jitter"] or 0, 1),
            "avg_mos_cq": round(row["avg_mos_cq"] or 0, 2),
            "min_mos_cq": round(row["min_mos_cq"] or 0, 2),
            "avg_mos_p564": round(row["avg_mos_p564"] or 0, 2),
            "avg_r_factor": round(row["avg_r_factor"] or 0, 1),
            "min_r_factor": round(row["min_r_factor"] or 0, 1),
            "record_count": row["record_count"],
            "period_start": row["period_start"],
            "period_end": row["period_end"],
        }
    finally:
        conn.close()


def get_multiple_call_summary(ssrcs: List[int], hours: int = 24) -> List[dict]:
    return [get_call_summary(ssrc, hours) for ssrc in ssrcs]
