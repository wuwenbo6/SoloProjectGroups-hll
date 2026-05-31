import sqlite3
import json
from dataclasses import asdict
from typing import List, Dict, Optional, Any
from datetime import datetime
import os

from .disassembler import Instruction, Function
from .risk_analyzer import RiskPattern, RiskAnalysisResult
from .string_extractor import ExtractedString


class AnalysisDatabase:
    def __init__(self, db_path: str = "avr_analysis.db"):
        self.db_path = db_path
        self.conn: Optional[sqlite3.Connection] = None
        self._initialize_database()

    def _initialize_database(self):
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        cursor = self.conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS firmware (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                size INTEGER NOT NULL,
                md5_hash TEXT,
                base_address INTEGER NOT NULL,
                analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, path)
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS instructions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                firmware_id INTEGER NOT NULL,
                address INTEGER NOT NULL,
                size INTEGER NOT NULL,
                mnemonic TEXT NOT NULL,
                op_str TEXT,
                bytes BLOB,
                operands TEXT,
                FOREIGN KEY (firmware_id) REFERENCES firmware(id)
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_instructions_firmware 
            ON instructions(firmware_id)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_instructions_address 
            ON instructions(address)
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS functions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                firmware_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                start_address INTEGER NOT NULL,
                end_address INTEGER NOT NULL,
                instruction_count INTEGER NOT NULL,
                calls TEXT,
                called_by TEXT,
                FOREIGN KEY (firmware_id) REFERENCES firmware(id)
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_functions_firmware 
            ON functions(firmware_id)
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS strings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                firmware_id INTEGER NOT NULL,
                address INTEGER NOT NULL,
                value TEXT NOT NULL,
                length INTEGER NOT NULL,
                encoding TEXT NOT NULL,
                refs TEXT,
                FOREIGN KEY (firmware_id) REFERENCES firmware(id)
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_strings_firmware 
            ON strings(firmware_id)
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS risk_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                firmware_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                level TEXT NOT NULL,
                addresses TEXT,
                FOREIGN KEY (firmware_id) REFERENCES firmware(id)
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_risks_firmware 
            ON risk_patterns(firmware_id)
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS analysis_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                firmware_id INTEGER NOT NULL,
                total_instructions INTEGER NOT NULL,
                total_functions INTEGER NOT NULL,
                total_strings INTEGER NOT NULL,
                total_risks INTEGER NOT NULL,
                critical_risks INTEGER NOT NULL,
                high_risks INTEGER NOT NULL,
                medium_risks INTEGER NOT NULL,
                low_risks INTEGER NOT NULL,
                FOREIGN KEY (firmware_id) REFERENCES firmware(id)
            )
        ''')
        
        self.conn.commit()

    def store_analysis(self, firmware_name: str, firmware_path: str, 
                       firmware_size: int, base_addr: int,
                       instructions: List[Instruction], 
                       functions: Dict[int, Function],
                       strings: List[ExtractedString],
                       risk_result: RiskAnalysisResult) -> int:
        cursor = self.conn.cursor()
        
        firmware_path = os.path.abspath(firmware_path)
        
        cursor.execute('''
            INSERT OR REPLACE INTO firmware 
            (name, path, size, base_address, analyzed_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (firmware_name, firmware_path, firmware_size, base_addr, datetime.now()))
        
        cursor.execute('SELECT id FROM firmware WHERE name = ? AND path = ?', 
                      (firmware_name, firmware_path))
        firmware_id = cursor.fetchone()[0]
        
        cursor.execute('DELETE FROM instructions WHERE firmware_id = ?', (firmware_id,))
        cursor.execute('DELETE FROM functions WHERE firmware_id = ?', (firmware_id,))
        cursor.execute('DELETE FROM strings WHERE firmware_id = ?', (firmware_id,))
        cursor.execute('DELETE FROM risk_patterns WHERE firmware_id = ?', (firmware_id,))
        cursor.execute('DELETE FROM analysis_summary WHERE firmware_id = ?', (firmware_id,))
        
        self._store_instructions(cursor, firmware_id, instructions)
        self._store_functions(cursor, firmware_id, functions)
        self._store_strings(cursor, firmware_id, strings)
        self._store_risks(cursor, firmware_id, risk_result)
        self._store_summary(cursor, firmware_id, instructions, functions, strings, risk_result)
        
        self.conn.commit()
        return firmware_id

    def _store_instructions(self, cursor: sqlite3.Cursor, firmware_id: int, 
                            instructions: List[Instruction]):
        data = []
        for insn in instructions:
            data.append((
                firmware_id,
                insn.address,
                insn.size,
                insn.mnemonic,
                insn.op_str,
                insn.bytes,
                json.dumps(insn.operands)
            ))
        
        cursor.executemany('''
            INSERT INTO instructions 
            (firmware_id, address, size, mnemonic, op_str, bytes, operands)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', data)

    def _store_functions(self, cursor: sqlite3.Cursor, firmware_id: int,
                         functions: Dict[int, Function]):
        data = []
        for func in functions.values():
            data.append((
                firmware_id,
                func.name,
                func.start_addr,
                func.end_addr,
                len(func.instructions),
                json.dumps(func.calls),
                json.dumps(func.called_by)
            ))
        
        cursor.executemany('''
            INSERT INTO functions 
            (firmware_id, name, start_address, end_address, instruction_count, calls, called_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', data)

    def _store_strings(self, cursor: sqlite3.Cursor, firmware_id: int,
                       strings: List[ExtractedString]):
        data = []
        for s in strings:
            data.append((
                firmware_id,
                s.address,
                s.value,
                s.length,
                s.encoding,
                json.dumps(s.references)
            ))
        
        cursor.executemany('''
            INSERT INTO strings 
            (firmware_id, address, value, length, encoding, refs)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', data)

    def _store_risks(self, cursor: sqlite3.Cursor, firmware_id: int,
                     risk_result: RiskAnalysisResult):
        data = []
        for pattern in risk_result.patterns:
            addresses = [insn.address for insn in pattern.instructions]
            data.append((
                firmware_id,
                pattern.name,
                pattern.description,
                pattern.level.value,
                json.dumps(addresses)
            ))
        
        cursor.executemany('''
            INSERT INTO risk_patterns 
            (firmware_id, name, description, level, addresses)
            VALUES (?, ?, ?, ?, ?)
        ''', data)

    def _store_summary(self, cursor: sqlite3.Cursor, firmware_id: int,
                       instructions: List[Instruction], 
                       functions: Dict[int, Function],
                       strings: List[ExtractedString],
                       risk_result: RiskAnalysisResult):
        cursor.execute('''
            INSERT INTO analysis_summary 
            (firmware_id, total_instructions, total_functions, total_strings,
             total_risks, critical_risks, high_risks, medium_risks, low_risks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            firmware_id,
            len(instructions),
            len(functions),
            len(strings),
            risk_result.total_risks,
            risk_result.critical_count,
            risk_result.high_count,
            risk_result.medium_count,
            risk_result.low_count
        ))

    def get_firmware_list(self) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM firmware ORDER BY analyzed_at DESC')
        return [dict(row) for row in cursor.fetchall()]

    def get_firmware_by_id(self, firmware_id: int) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM firmware WHERE id = ?', (firmware_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_analysis_summary(self, firmware_id: int) -> Optional[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM analysis_summary WHERE firmware_id = ?', (firmware_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def get_instructions(self, firmware_id: int, 
                         start_addr: Optional[int] = None,
                         limit: Optional[int] = None) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        query = 'SELECT * FROM instructions WHERE firmware_id = ?'
        params = [firmware_id]
        
        if start_addr is not None:
            query += ' AND address >= ?'
            params.append(start_addr)
        
        query += ' ORDER BY address'
        
        if limit is not None:
            query += ' LIMIT ?'
            params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

    def get_functions(self, firmware_id: int) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT * FROM functions WHERE firmware_id = ? 
            ORDER BY start_address
        ''', (firmware_id,))
        return [dict(row) for row in cursor.fetchall()]

    def get_strings(self, firmware_id: int, search: Optional[str] = None) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        query = 'SELECT * FROM strings WHERE firmware_id = ?'
        params = [firmware_id]
        
        if search:
            query += ' AND value LIKE ?'
            params.append(f'%{search}%')
        
        query += ' ORDER BY address'
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

    def get_risks(self, firmware_id: int, level: Optional[str] = None) -> List[Dict[str, Any]]:
        cursor = self.conn.cursor()
        query = 'SELECT * FROM risk_patterns WHERE firmware_id = ?'
        params = [firmware_id]
        
        if level:
            query += ' AND level = ?'
            params.append(level.lower())
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

    def delete_firmware(self, firmware_id: int) -> bool:
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM firmware WHERE id = ?', (firmware_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    def close(self):
        if self.conn:
            self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
