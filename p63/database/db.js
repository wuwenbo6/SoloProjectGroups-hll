const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'conversions.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS conversions (
      id TEXT PRIMARY KEY,
      original_filename TEXT NOT NULL,
      original_path TEXT NOT NULL,
      formats TEXT NOT NULL,
      output_paths TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      watermark_config TEXT,
      thumbnail_path TEXT,
      create_thumbnail INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);

  db.all("PRAGMA table_info(conversions)", [], (err, columns) => {
    if (err) {
      console.error('Error getting table info:', err.message);
      return;
    }
    
    const columnNames = columns ? columns.map(col => col.name) : [];
    
    const addColumnIfMissing = (colName, colDef) => {
      if (!columnNames.includes(colName)) {
        db.run(`ALTER TABLE conversions ADD COLUMN ${colName} ${colDef}`, (alterErr) => {
          if (alterErr) {
            console.log(`Column ${colName} may already exist:`, alterErr.message);
          }
        });
      }
    };
    
    addColumnIfMissing('formats', 'TEXT');
    addColumnIfMissing('output_paths', 'TEXT');
    addColumnIfMissing('watermark_config', 'TEXT');
    addColumnIfMissing('thumbnail_path', 'TEXT');
    addColumnIfMissing('create_thumbnail', 'INTEGER DEFAULT 0');
  });
});

module.exports = {
  createConversion: (id, originalFilename, originalPath, formats, watermarkConfig = null, createThumbnail = false) => {
    return new Promise((resolve, reject) => {
      const formatsStr = Array.isArray(formats) ? JSON.stringify(formats) : formats;
      const watermarkStr = watermarkConfig ? JSON.stringify(watermarkConfig) : null;
      
      db.run(
        `INSERT INTO conversions (id, original_filename, original_path, formats, watermark_config, create_thumbnail) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, originalFilename, originalPath, formatsStr, watermarkStr, createThumbnail ? 1 : 0],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  },

  getConversion: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM conversions WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else {
          if (row) {
            try {
              row.formats = JSON.parse(row.formats);
            } catch (e) {
              row.formats = row.formats ? [row.formats] : [];
            }
            try {
              row.output_paths = row.output_paths ? JSON.parse(row.output_paths) : {};
            } catch (e) {
              row.output_paths = {};
            }
            try {
              row.watermark_config = row.watermark_config ? JSON.parse(row.watermark_config) : null;
            } catch (e) {
              row.watermark_config = null;
            }
          }
          resolve(row);
        }
      });
    });
  },

  updateConversionStatus: (id, status, outputPaths = null, errorMessage = null) => {
    return new Promise((resolve, reject) => {
      const outputPathsStr = outputPaths ? JSON.stringify(outputPaths) : null;
      
      db.run(
        `UPDATE conversions SET status = ?, output_paths = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, outputPathsStr, errorMessage, id],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  },

  updateThumbnailPath: (id, thumbnailPath) => {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE conversions SET thumbnail_path = ? WHERE id = ?`,
        [thumbnailPath, id],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  },

  getAllConversions: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM conversions ORDER BY created_at DESC LIMIT 50', [], (err, rows) => {
        if (err) reject(err);
        else {
          const parsedRows = rows.map(row => {
            try {
              row.formats = JSON.parse(row.formats);
            } catch (e) {
              row.formats = row.formats ? [row.formats] : [];
            }
            try {
              row.output_paths = row.output_paths ? JSON.parse(row.output_paths) : {};
            } catch (e) {
              row.output_paths = {};
            }
            try {
              row.watermark_config = row.watermark_config ? JSON.parse(row.watermark_config) : null;
            } catch (e) {
              row.watermark_config = null;
            }
            return row;
          });
          resolve(parsedRows);
        }
      });
    });
  },

  deleteConversion: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM conversions WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }
};
