const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

class VideoDatabase {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
        this.initPromise = null;
    }

    async initDatabase() {
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = (async () => {
        const SQL = await initSqlJs();
        const dbDir = path.dirname(this.dbPath);
        
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        let dbData = null;
        if (fs.existsSync(this.dbPath)) {
            dbData = fs.readFileSync(this.dbPath);
        }

        this.db = new SQL.Database(dbData);
        this.initTables();
        this.save();
        })();
        
        return this.initPromise;
    }

    initTables() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                original_path TEXT NOT NULL,
                stored_path TEXT,
                file_size INTEGER,
                duration REAL,
                width INTEGER,
                height INTEGER,
                fps REAL,
                total_frames INTEGER,
                status TEXT DEFAULT 'uploaded',
                analysis_result TEXT,
                summary_path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS motion_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT,
                start_time REAL,
                end_time REAL,
                duration REAL,
                object_count INTEGER,
                FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at);
            CREATE INDEX IF NOT EXISTS idx_segments_video ON motion_segments(video_id);
        `);
    }

    save() {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
    }

    addVideo(videoData) {
        const stmt = this.db.prepare(`
            INSERT INTO videos (
                id, filename, original_path, stored_path, file_size,
                duration, width, height, fps, total_frames, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run([
            videoData.id,
            videoData.filename,
            videoData.original_path,
            videoData.stored_path || null,
            videoData.file_size || null,
            videoData.duration || null,
            videoData.width || null,
            videoData.height || null,
            videoData.fps || null,
            videoData.total_frames || null,
            videoData.status || 'uploaded'
        ]);
        
        this.save();
        return videoData.id;
    }

    updateVideoAnalysis(videoId, analysisResult) {
        const info = analysisResult.video_info;
        this.db.run(`
            UPDATE videos 
            SET analysis_result = ?, 
                duration = ?, 
                width = ?, 
                height = ?, 
                fps = ?, 
                total_frames = ?,
                status = 'analyzed',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            JSON.stringify(analysisResult),
            info.duration,
            info.width,
            info.height,
            info.fps,
            info.total_frames,
            videoId
        ]);

        this.db.run('DELETE FROM motion_segments WHERE video_id = ?', [videoId]);
        
        if (analysisResult.motion_intervals && analysisResult.motion_intervals.length > 0) {
            for (const interval of analysisResult.motion_intervals) {
                this.db.run(`
                    INSERT INTO motion_segments (video_id, start_time, end_time, duration)
                    VALUES (?, ?, ?, ?)
                `, [
                    videoId,
                    interval.start,
                    interval.end,
                    interval.duration
                ]);
            }
        }

        this.save();
    }

    updateVideoSummary(videoId, summaryPath) {
        this.db.run(`
            UPDATE videos 
            SET summary_path = ?, status = 'summarized', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [summaryPath, videoId]);
        this.save();
    }

    getVideo(videoId) {
        const stmt = this.db.prepare('SELECT * FROM videos WHERE id = ?');
        stmt.bind([videoId]);
        let video = null;
        
        while (stmt.step()) {
            video = stmt.getAsObject();
        }
        stmt.free();
        
        if (video && video.analysis_result) {
            video.analysis_result = JSON.parse(video.analysis_result);
        }
        
        return video;
    }

    getAllVideos() {
        const results = [];
        const stmt = this.db.prepare(`
            SELECT * FROM videos 
            ORDER BY created_at DESC
        `);
        
        while (stmt.step()) {
            const video = stmt.getAsObject();
            if (video.analysis_result) {
                video.analysis_result = JSON.parse(video.analysis_result);
            }
            results.push(video);
        }
        stmt.free();
        
        return results;
    }

    deleteVideo(videoId) {
        const stmt = this.db.prepare('DELETE FROM videos WHERE id = ?');
        stmt.run([videoId]);
        const changes = this.db.getRowsModified();
        this.save();
        return changes > 0;
    }

    getMotionSegments(videoId) {
        const results = [];
        const stmt = this.db.prepare(`
            SELECT * FROM motion_segments 
            WHERE video_id = ? 
            ORDER BY start_time
        `);
        stmt.bind([videoId]);
        
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        
        return results;
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

module.exports = VideoDatabase;
