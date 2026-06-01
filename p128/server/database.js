const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

function initDatabase() {
    return new Promise((resolve, reject) => {
        const dbPath = path.join(__dirname, 'piano_trainer.db');
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                reject(err);
            } else {
                createTables()
                    .then(() => {
                        console.log('Database initialized successfully');
                        resolve(db);
                    })
                    .catch(reject);
            }
        });
    });
}

function createTables() {
    return new Promise((resolve, reject) => {
        const sql = `
            CREATE TABLE IF NOT EXISTS practice_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sheet_id TEXT NOT NULL,
                sheet_title TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER NOT NULL,
                duration INTEGER NOT NULL,
                total_notes INTEGER NOT NULL,
                correct_notes INTEGER NOT NULL,
                wrong_notes INTEGER NOT NULL,
                accuracy REAL NOT NULL,
                notes_played TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sheet_music (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                difficulty TEXT,
                key_signature TEXT,
                tempo INTEGER,
                time_signature TEXT,
                description TEXT,
                measures TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_practice_records_sheet_id 
                ON practice_records(sheet_id);
            CREATE INDEX IF NOT EXISTS idx_practice_records_start_time 
                ON practice_records(start_time);
        `;
        
        db.exec(sql, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function savePracticeRecord(record) {
    const sql = `
        INSERT INTO practice_records (
            sheet_id, sheet_title, start_time, end_time, duration,
            total_notes, correct_notes, wrong_notes, accuracy, notes_played
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result = await runQuery(sql, [
        record.sheetId,
        record.sheetTitle,
        record.startTime,
        record.endTime,
        record.duration,
        record.totalNotes,
        record.correctNotes,
        record.wrongNotes,
        record.accuracy,
        JSON.stringify(record.notesPlayed || [])
    ]);
    
    return { id: result.lastID, ...record };
}

async function getPracticeRecords(limit = 50, offset = 0) {
    const sql = `
        SELECT * FROM practice_records
        ORDER BY start_time DESC
        LIMIT ? OFFSET ?
    `;
    
    const rows = await allQuery(sql, [limit, offset]);
    
    return rows.map(row => ({
        id: row.id,
        sheetId: row.sheet_id,
        sheetTitle: row.sheet_title,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration,
        totalNotes: row.total_notes,
        correctNotes: row.correct_notes,
        wrongNotes: row.wrong_notes,
        accuracy: row.accuracy,
        notesPlayed: JSON.parse(row.notes_played || '[]'),
        createdAt: row.created_at
    }));
}

async function getPracticeRecordById(id) {
    const sql = `
        SELECT * FROM practice_records WHERE id = ?
    `;
    
    const row = await getQuery(sql, [id]);
    
    if (!row) return null;
    
    return {
        id: row.id,
        sheetId: row.sheet_id,
        sheetTitle: row.sheet_title,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration,
        totalNotes: row.total_notes,
        correctNotes: row.correct_notes,
        wrongNotes: row.wrong_notes,
        accuracy: row.accuracy,
        notesPlayed: JSON.parse(row.notes_played || '[]'),
        createdAt: row.created_at
    };
}

async function getPracticeRecordsBySheetId(sheetId, limit = 50) {
    const sql = `
        SELECT * FROM practice_records
        WHERE sheet_id = ?
        ORDER BY start_time DESC
        LIMIT ?
    `;
    
    const rows = await allQuery(sql, [sheetId, limit]);
    
    return rows.map(row => ({
        id: row.id,
        sheetId: row.sheet_id,
        sheetTitle: row.sheet_title,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration,
        totalNotes: row.total_notes,
        correctNotes: row.correct_notes,
        wrongNotes: row.wrong_notes,
        accuracy: row.accuracy,
        createdAt: row.created_at
    }));
}

async function deletePracticeRecord(id) {
    const sql = `
        DELETE FROM practice_records WHERE id = ?
    `;
    
    const result = await runQuery(sql, [id]);
    return result.changes > 0;
}

async function getPracticeStats() {
    const sql = `
        SELECT 
            COUNT(*) as total_sessions,
            SUM(duration) as total_duration,
            AVG(accuracy) as avg_accuracy,
            SUM(correct_notes) as total_correct_notes,
            SUM(wrong_notes) as total_wrong_notes
        FROM practice_records
    `;
    
    const row = await getQuery(sql);
    
    return {
        totalSessions: row?.total_sessions || 0,
        totalDuration: row?.total_duration || 0,
        avgAccuracy: row?.avg_accuracy ? Math.round(row.avg_accuracy) : 0,
        totalCorrectNotes: row?.total_correct_notes || 0,
        totalWrongNotes: row?.total_wrong_notes || 0
    };
}

async function saveSheetMusic(sheet) {
    const sql = `
        INSERT OR REPLACE INTO sheet_music (
            id, title, difficulty, key_signature, tempo,
            time_signature, description, measures, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    
    await runQuery(sql, [
        sheet.id,
        sheet.title,
        sheet.difficulty || null,
        sheet.key || null,
        sheet.tempo || null,
        sheet.timeSignature || null,
        sheet.description || null,
        JSON.stringify(sheet.measures || [])
    ]);
    
    return sheet;
}

async function getSheetMusicList() {
    const sql = `
        SELECT id, title, difficulty, key_signature, tempo, 
               time_signature, description, created_at, updated_at
        FROM sheet_music
        ORDER BY created_at DESC
    `;
    
    const rows = await allQuery(sql);
    
    return rows.map(row => ({
        id: row.id,
        title: row.title,
        difficulty: row.difficulty,
        key: row.key_signature,
        tempo: row.tempo,
        timeSignature: row.time_signature,
        description: row.description,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));
}

async function getSheetMusicById(id) {
    const sql = `
        SELECT * FROM sheet_music WHERE id = ?
    `;
    
    const row = await getQuery(sql, [id]);
    
    if (!row) return null;
    
    return {
        id: row.id,
        title: row.title,
        difficulty: row.difficulty,
        key: row.key_signature,
        tempo: row.tempo,
        timeSignature: row.time_signature,
        description: row.description,
        measures: JSON.parse(row.measures || '[]'),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function deleteSheetMusic(id) {
    const sql = `
        DELETE FROM sheet_music WHERE id = ?
    `;
    
    const result = await runQuery(sql, [id]);
    return result.changes > 0;
}

function getDb() {
    return db;
}

module.exports = {
    initDatabase,
    savePracticeRecord,
    getPracticeRecords,
    getPracticeRecordById,
    getPracticeRecordsBySheetId,
    deletePracticeRecord,
    getPracticeStats,
    saveSheetMusic,
    getSheetMusicList,
    getSheetMusicById,
    deleteSheetMusic,
    getDb
};
