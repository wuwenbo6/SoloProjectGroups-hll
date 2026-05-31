const Database = require('better-sqlite3');
const path = require('path');

class ParticleDatabase {
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.init();
    }

    init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_name TEXT NOT NULL,
                image_path TEXT NOT NULL,
                total_count INTEGER NOT NULL,
                avg_area REAL,
                avg_circularity REAL,
                scale_factor REAL DEFAULT 1.0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS particles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                analysis_id INTEGER NOT NULL,
                particle_id INTEGER NOT NULL,
                area REAL NOT NULL,
                area_px REAL,
                perimeter REAL NOT NULL,
                perimeter_px REAL,
                circularity REAL NOT NULL,
                centroid_x INTEGER NOT NULL,
                centroid_y INTEGER NOT NULL,
                FOREIGN KEY (analysis_id) REFERENCES analyses (id)
            );
        `);
        
        try {
            this.db.exec(`ALTER TABLE analyses ADD COLUMN scale_factor REAL DEFAULT 1.0`);
        } catch (e) {}
        
        try {
            this.db.exec(`ALTER TABLE particles ADD COLUMN area_px REAL`);
        } catch (e) {}
        
        try {
            this.db.exec(`ALTER TABLE particles ADD COLUMN perimeter_px REAL`);
        } catch (e) {}
    }

    saveAnalysis(imageName, imagePath, result) {
        const insertAnalysis = this.db.prepare(`
            INSERT INTO analyses (image_name, image_path, total_count, avg_area, avg_circularity, scale_factor)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const insertParticle = this.db.prepare(`
            INSERT INTO particles (analysis_id, particle_id, area, area_px, perimeter, perimeter_px, circularity, centroid_x, centroid_y)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = this.db.transaction((analysisId, particles) => {
            for (const p of particles) {
                insertParticle.run(
                    analysisId,
                    p.id,
                    p.area,
                    p.area_px || p.area,
                    p.perimeter,
                    p.perimeter_px || p.perimeter,
                    p.circularity,
                    p.centroid.x,
                    p.centroid.y
                );
            }
        });

        const info = insertAnalysis.run(
            imageName,
            imagePath,
            result.total_count,
            result.statistics.avg_area,
            result.statistics.avg_circularity,
            result.scale_factor || 1.0
        );

        const analysisId = info.lastInsertRowid;
        insertMany(analysisId, result.particles);

        return analysisId;
    }

    getAllAnalyses() {
        return this.db.prepare(`
            SELECT * FROM analyses ORDER BY created_at DESC
        `).all();
    }

    getAnalysisParticles(analysisId) {
        return this.db.prepare(`
            SELECT * FROM particles WHERE analysis_id = ?
        `).all(analysisId);
    }

    deleteAnalysis(analysisId) {
        this.db.prepare('DELETE FROM particles WHERE analysis_id = ?').run(analysisId);
        this.db.prepare('DELETE FROM analyses WHERE id = ?').run(analysisId);
    }

    close() {
        this.db.close();
    }
}

module.exports = ParticleDatabase;
