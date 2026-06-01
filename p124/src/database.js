const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')

class DatabaseModule {
  constructor(dbPath) {
    this.dbPath = dbPath
    this.db = null
    this.SQL = null
  }

  async init() {
    try {
      this.SQL = await initSqlJs()

      if (fs.existsSync(this.dbPath)) {
        const fileBuffer = fs.readFileSync(this.dbPath)
        this.db = new this.SQL.Database(fileBuffer)
      } else {
        this.db = new this.SQL.Database()
      }

      this._exec('PRAGMA foreign_keys = ON')
      this._createTables()
      this._autoSave()
    } catch (err) {
      throw new Error(`数据库初始化失败: ${err.message}`)
    }
  }

  _autoSave() {
    setInterval(() => {
      this._saveToFile()
    }, 5000)
  }

  _saveToFile() {
    if (!this.db) return
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      const tempPath = this.dbPath + '.tmp'
      fs.writeFileSync(tempPath, buffer)
      fs.renameSync(tempPath, this.dbPath)
    } catch (err) {
      console.error('保存数据库失败:', err)
    }
  }

  _exec(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql)
      stmt.bind(params)
      const results = []
      while (stmt.step()) {
        results.push(stmt.getAsObject())
      }
      stmt.free()
      return results
    } catch (err) {
      throw err
    }
  }

  _run(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql)
      stmt.bind(params)
      stmt.step()
      const changes = this.db.getRowsModified()
      const lastInsertRowid = this.db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
      stmt.free()
      return { changes, lastInsertRowid }
    } catch (err) {
      throw err
    }
  }

  _createTables() {
    this._exec(`
      CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        location TEXT,
        soil_type TEXT,
        depth TEXT,
        bulk_density REAL,
        particle_density REAL,
        porosity REAL,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `)

    this._exec(`
      CREATE TABLE IF NOT EXISTS sample_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_id INTEGER NOT NULL,
        pressure REAL NOT NULL,
        water_content REAL NOT NULL,
        timestamp TEXT,
        notes TEXT,
        FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE
      )
    `)

    this._exec(`
      CREATE TABLE IF NOT EXISTS fit_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_id INTEGER NOT NULL,
        theta_r REAL,
        theta_s REAL,
        alpha REAL,
        n REAL,
        m REAL,
        rmse REAL,
        r2 REAL,
        ssr REAL,
        fitted_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE
      )
    `)

    this._exec('CREATE INDEX IF NOT EXISTS idx_sample_data_sample_id ON sample_data(sample_id)')
    this._exec('CREATE INDEX IF NOT EXISTS idx_fit_results_sample_id ON fit_results(sample_id)')
    this._exec('CREATE INDEX IF NOT EXISTS idx_samples_name ON samples(name)')
  }

  getAllSamples() {
    const samples = this._exec(`
      SELECT s.* FROM samples s
      ORDER BY s.created_at DESC
    `)

    return samples.map(s => {
      const dataCount = this._exec('SELECT COUNT(*) as cnt FROM sample_data WHERE sample_id = ?', [s.id])[0].cnt
      const fitCount = this._exec('SELECT COUNT(*) as cnt FROM fit_results WHERE sample_id = ?', [s.id])[0].cnt
      return { ...s, data_count: dataCount, fit_count: fitCount }
    })
  }

  getSampleById(id) {
    const samples = this._exec('SELECT * FROM samples WHERE id = ?', [id])
    if (samples.length === 0) return null

    const sample = samples[0]
    sample.data = this._exec(`
      SELECT * FROM sample_data
      WHERE sample_id = ?
      ORDER BY pressure ASC
    `, [id])

    const fitResults = this._exec(`
      SELECT * FROM fit_results
      WHERE sample_id = ?
      ORDER BY fitted_at DESC
      LIMIT 1
    `, [id])
    sample.fitResult = fitResults.length > 0 ? fitResults[0] : null

    return sample
  }

  saveSample(sample) {
    const { name, description = '', location = '', soil_type = '', depth = '',
            bulk_density = null, particle_density = null, porosity = null,
            data = [], fitResult = null } = sample

    const insertResult = this._run(`
      INSERT INTO samples (name, description, location, soil_type, depth,
                          bulk_density, particle_density, porosity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, description, location, soil_type, depth,
        bulk_density, particle_density, porosity])

    const sampleId = insertResult.lastInsertRowid

    if (data && data.length > 0) {
      for (const d of data) {
        this._run(`
          INSERT INTO sample_data (sample_id, pressure, water_content, timestamp, notes)
          VALUES (?, ?, ?, ?, ?)
        `, [sampleId, d.pressure, d.waterContent, d.timestamp || null, d.notes || null])
      }
    }

    if (fitResult) {
      this._run(`
        INSERT INTO fit_results (sample_id, theta_r, theta_s, alpha, n, m, rmse, r2, ssr)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [sampleId, fitResult.thetaR, fitResult.thetaS, fitResult.alpha,
          fitResult.n, fitResult.m, fitResult.rmse, fitResult.r2, fitResult.ssr])
    }

    this._saveToFile()
    return sampleId
  }

  updateSample(sample) {
    const { id, name, description, location, soil_type, depth,
            bulk_density, particle_density, porosity } = sample

    this._run(`
      UPDATE samples
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          location = COALESCE(?, location),
          soil_type = COALESCE(?, soil_type),
          depth = COALESCE(?, depth),
          bulk_density = COALESCE(?, bulk_density),
          particle_density = COALESCE(?, particle_density),
          porosity = COALESCE(?, porosity),
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `, [name, description, location, soil_type, depth,
        bulk_density, particle_density, porosity, id])

    this._saveToFile()
  }

  deleteSample(id) {
    this._run('DELETE FROM samples WHERE id = ?', [id])
    this._saveToFile()
  }

  searchSamples(keyword) {
    const searchPattern = `%${keyword}%`
    const samples = this._exec(`
      SELECT s.* FROM samples s
      WHERE s.name LIKE ?
         OR s.description LIKE ?
         OR s.location LIKE ?
         OR s.soil_type LIKE ?
      ORDER BY s.created_at DESC
    `, [searchPattern, searchPattern, searchPattern, searchPattern])

    return samples.map(s => {
      const dataCount = this._exec('SELECT COUNT(*) as cnt FROM sample_data WHERE sample_id = ?', [s.id])[0].cnt
      const fitCount = this._exec('SELECT COUNT(*) as cnt FROM fit_results WHERE sample_id = ?', [s.id])[0].cnt
      return { ...s, data_count: dataCount, fit_count: fitCount }
    })
  }

  addSampleData(sampleId, data) {
    const result = this._run(`
      INSERT INTO sample_data (sample_id, pressure, water_content, timestamp, notes)
      VALUES (?, ?, ?, ?, ?)
    `, [sampleId, data.pressure, data.waterContent, data.timestamp || null, data.notes || null])
    this._saveToFile()
    return result
  }

  addFitResult(sampleId, fitResult) {
    const result = this._run(`
      INSERT INTO fit_results (sample_id, theta_r, theta_s, alpha, n, m, rmse, r2, ssr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [sampleId, fitResult.thetaR, fitResult.thetaS, fitResult.alpha,
        fitResult.n, fitResult.m, fitResult.rmse, fitResult.r2, fitResult.ssr])
    this._saveToFile()
    return result
  }

  deleteSampleData(sampleId, dataId) {
    this._run('DELETE FROM sample_data WHERE id = ? AND sample_id = ?', [dataId, sampleId])
    this._saveToFile()
  }

  close() {
    if (this.db) {
      this._saveToFile()
      this.db.close()
      this.db = null
    }
  }
}

module.exports = DatabaseModule
