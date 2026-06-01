const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseManager {
  constructor() {
    const dbPath = path.join(__dirname, '../data');
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
    }
    this.dbPath = path.join(dbPath, 'nfc-posters.db');
    this.db = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this._createTables()
          .then(() => this._insertDefaultData())
          .then(resolve)
          .catch(reject);
      });
    });
  }

  _createTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS posters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tag_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS touch_statistics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poster_id INTEGER,
            tag_id TEXT NOT NULL,
            touched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (poster_id) REFERENCES posters (id)
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS display_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poster_id INTEGER,
            tag_id TEXT,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_time DATETIME,
            duration_seconds INTEGER,
            source TEXT,
            FOREIGN KEY (poster_id) REFERENCES posters (id)
          )
        `);

        this.db.run('CREATE INDEX IF NOT EXISTS idx_touch_tag_id ON touch_statistics(tag_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_touch_poster_id ON touch_statistics(poster_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_touch_date ON touch_statistics(touched_at)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_session_poster_id ON display_sessions(poster_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_session_start ON display_sessions(start_time)', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  _insertDefaultData() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as count FROM posters', (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        if (row.count === 0) {
          const defaultPosters = [
            { tag_id: 'NFC001', title: '欢迎海报', url: 'https://example.com/welcome', description: '默认欢迎海报' },
            { tag_id: 'NFC002', title: '产品介绍', url: 'https://example.com/products', description: '产品展示海报' },
            { tag_id: 'NFC003', title: '活动宣传', url: 'https://example.com/events', description: '活动推广海报' }
          ];

          const stmt = this.db.prepare('INSERT INTO posters (tag_id, title, url, description) VALUES (?, ?, ?, ?)');
          let completed = 0;
          defaultPosters.forEach(poster => {
            stmt.run(poster.tag_id, poster.title, poster.url, poster.description, (err) => {
              if (err) reject(err);
              completed++;
              if (completed === defaultPosters.length) resolve();
            });
          });
        } else {
          resolve();
        }
      });
    });
  }

  getAllPosters() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM posters ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getPosterByTagId(tagId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM posters WHERE tag_id = ?', [tagId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  addPoster(poster) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO posters (tag_id, title, url, description) VALUES (?, ?, ?, ?)',
        [poster.tag_id, poster.title, poster.url, poster.description || ''],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, ...poster });
        }
      );
    });
  }

  updatePoster(id, poster) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE posters SET tag_id = ?, title = ?, url = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [poster.tag_id, poster.title, poster.url, poster.description || '', id],
        function(err) {
          if (err) reject(err);
          else resolve({ id, ...poster });
        }
      );
    });
  }

  deletePoster(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM touch_statistics WHERE poster_id = ?', [id], (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.db.run('DELETE FROM posters WHERE id = ?', [id], (err) => {
          if (err) reject(err);
          else resolve({ success: true });
        });
      });
    });
  }

  recordTouch(tagId, posterId = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO touch_statistics (tag_id, poster_id) VALUES (?, ?)',
        [tagId, posterId],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, tagId, posterId, touchedAt: new Date().toISOString() });
        }
      );
    });
  }

  startDisplaySession(posterId, tagId = null, source = 'nfc') {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO display_sessions (poster_id, tag_id, source) VALUES (?, ?, ?)',
        [posterId, tagId, source],
        function(err) {
          if (err) reject(err);
          else resolve({ sessionId: this.lastID, posterId, tagId, source });
        }
      );
    });
  }

  endDisplaySession(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM display_sessions WHERE id = ?', [sessionId], (err, session) => {
        if (err) { reject(err); return; }
        if (!session) { resolve(null); return; }

        const startTime = new Date(session.start_time);
        const endTime = new Date();
        const durationSeconds = Math.floor((endTime - startTime) / 1000);

        this.db.run(
          'UPDATE display_sessions SET end_time = ?, duration_seconds = ? WHERE id = ?',
          [endTime.toISOString(), durationSeconds, sessionId],
          (err) => {
            if (err) reject(err);
            else resolve({ sessionId, durationSeconds, endTime: endTime.toISOString() });
          }
        );
      });
    });
  }

  getCurrentDisplaySession() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM display_sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1',
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  getStatistics() {
    return new Promise((resolve, reject) => {
      const result = {};
      
      this.db.get('SELECT COUNT(*) as count FROM touch_statistics', (err, row) => {
        if (err) { reject(err); return; }
        result.totalTouches = row.count;

        this.db.all(`
          SELECT 
            p.id,
            p.tag_id,
            p.title,
            p.url,
            COUNT(ts.id) as touch_count,
            COALESCE(SUM(ds.duration_seconds), 0) as total_duration_seconds,
            COALESCE(AVG(ds.duration_seconds), 0) as avg_duration_seconds
          FROM posters p
          LEFT JOIN touch_statistics ts ON p.id = ts.poster_id
          LEFT JOIN display_sessions ds ON p.id = ds.poster_id
          GROUP BY p.id
          ORDER BY touch_count DESC
        `, (err, rows) => {
          if (err) { reject(err); return; }
          result.posterStats = rows;

          this.db.get(`
            SELECT COUNT(*) as count 
            FROM touch_statistics 
            WHERE DATE(touched_at) = DATE('now')
          `, (err, row) => {
            if (err) { reject(err); return; }
            result.todayTouches = row.count;

            this.db.get(`
              SELECT COALESCE(SUM(duration_seconds), 0) as total_duration
              FROM display_sessions
              WHERE DATE(start_time) = DATE('now')
            `, (err, row) => {
              if (err) { reject(err); return; }
              result.todayDuration = row.total_duration;

              this.db.get(`
                SELECT COALESCE(SUM(duration_seconds), 0) as total_duration
                FROM display_sessions
              `, (err, row) => {
                if (err) { reject(err); return; }
                result.totalDuration = row.total_duration;

                this.db.all(`
                  SELECT 
                    ts.id,
                    ts.tag_id,
                    p.title,
                    ts.touched_at
                  FROM touch_statistics ts
                  LEFT JOIN posters p ON ts.poster_id = p.id
                  ORDER BY ts.touched_at DESC
                  LIMIT 20
                `, (err, rows) => {
                  if (err) { reject(err); return; }
                  result.recentTouches = rows;
                  resolve(result);
                });
              });
            });
          });
        });
      });
    });
  }

  exportReport(format = 'csv', startDate = null, endDate = null) {
    return new Promise((resolve, reject) => {
      let touchQuery = 'SELECT * FROM touch_statistics';
      let sessionQuery = 'SELECT * FROM display_sessions';
      const params = [];

      if (startDate && endDate) {
        touchQuery += ' WHERE DATE(touched_at) BETWEEN ? AND ?';
        sessionQuery += ' WHERE DATE(start_time) BETWEEN ? AND ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        touchQuery += ' WHERE DATE(touched_at) >= ?';
        sessionQuery += ' WHERE DATE(start_time) >= ?';
        params.push(startDate);
      }

      this.db.all(touchQuery, params, (err, touches) => {
        if (err) { reject(err); return; }

        this.db.all(sessionQuery, params, (err, sessions) => {
          if (err) { reject(err); return; }

          this.db.all('SELECT * FROM posters', (err, posters) => {
            if (err) { reject(err); return; }

            const posterMap = {};
            posters.forEach(p => posterMap[p.id] = p);

            if (format === 'json') {
              resolve(JSON.stringify({
                exportDate: new Date().toISOString(),
                dateRange: { startDate, endDate },
                posters,
                touches,
                sessions
              }, null, 2));
            } else {
              let csv = '\ufeff';
              
              csv += '=== 触碰记录 ===\n';
              csv += 'ID,标签ID,海报ID,海报标题,触碰时间\n';
              touches.forEach(t => {
                const poster = posterMap[t.poster_id];
                csv += `${t.id},"${t.tag_id}",${t.poster_id || ''},"${poster ? poster.title : ''}","${t.touched_at}"\n`;
              });

              csv += '\n=== 显示会话 ===\n';
              csv += 'ID,海报ID,海报标题,标签ID,开始时间,结束时间,停留时长(秒),来源\n';
              sessions.forEach(s => {
                const poster = posterMap[s.poster_id];
                csv += `${s.id},${s.poster_id || ''},"${poster ? poster.title : ''}","${s.tag_id || ''}","${s.start_time}","${s.end_time || ''}",${s.duration_seconds || ''},"${s.source || ''}"\n`;
              });

              csv += '\n=== 海报统计汇总 ===\n';
              csv += '海报ID,标签ID,标题,URL,触碰次数,总停留时长(秒),平均停留时长(秒)\n';
              posters.forEach(p => {
                const posterTouches = touches.filter(t => t.poster_id === p.id);
                const posterSessions = sessions.filter(s => s.poster_id === p.id);
                const totalDuration = posterSessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
                const avgDuration = posterSessions.length > 0 ? totalDuration / posterSessions.length : 0;
                csv += `${p.id},"${p.tag_id}","${p.title}","${p.url}",${posterTouches.length},${totalDuration},${avgDuration.toFixed(2)}\n`;
              });

              resolve(csv);
            }
          });
        });
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(resolve);
      } else {
        resolve();
      }
    });
  }
}

module.exports = DatabaseManager;