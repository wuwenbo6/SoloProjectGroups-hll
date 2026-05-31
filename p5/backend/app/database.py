import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'go_game.db')

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS game_records (
                id TEXT PRIMARY KEY,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                black_player TEXT NOT NULL,
                white_player TEXT NOT NULL,
                winner TEXT NOT NULL,
                board_size INTEGER NOT NULL DEFAULT 19,
                move_count INTEGER NOT NULL DEFAULT 0
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS moves (
                id TEXT PRIMARY KEY,
                game_id TEXT NOT NULL,
                move_number INTEGER NOT NULL,
                x INTEGER NOT NULL,
                y INTEGER NOT NULL,
                color TEXT NOT NULL,
                win_rate REAL,
                FOREIGN KEY (game_id) REFERENCES game_records(id)
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id)')
        conn.commit()

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()
