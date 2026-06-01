const sqlite3 = require('sqlite3').verbose();

class InstrumentDatabase {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
    this._initialize();
  }

  _initialize() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            scpi TEXT NOT NULL,
            description TEXT,
            category TEXT,
            is_query INTEGER DEFAULT 0,
            params TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS sequences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            language TEXT DEFAULT 'javascript',
            code TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS sequence_steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sequence_id INTEGER,
            command_id INTEGER,
            step_order INTEGER,
            params TEXT,
            delay_ms INTEGER DEFAULT 0,
            FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE,
            FOREIGN KEY (command_id) REFERENCES commands(id) ON DELETE SET NULL
          )
        `);

        this.db.run(`CREATE INDEX IF NOT EXISTS idx_commands_category ON commands(category)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON sequence_steps(sequence_id)`);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS test_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sequence_id INTEGER,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'running',
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_at DATETIME,
            total_tests INTEGER DEFAULT 0,
            passed_tests INTEGER DEFAULT 0,
            failed_tests INTEGER DEFAULT 0,
            device_id TEXT,
            notes TEXT,
            FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE SET NULL
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS test_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_run_id INTEGER,
            name TEXT NOT NULL,
            command TEXT,
            measured_value REAL,
            unit TEXT,
            min_limit REAL,
            max_limit REAL,
            status TEXT NOT NULL,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS measurement_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            command TEXT NOT NULL,
            value REAL NOT NULL,
            unit TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        this.db.run(`CREATE INDEX IF NOT EXISTS idx_test_runs_sequence ON test_runs(sequence_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_test_results_run ON test_results(test_run_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_measurement_device ON measurement_history(device_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_measurement_time ON measurement_history(created_at)`);

        this._seedData().then(resolve).catch(reject);
      });
    });
  }

  _seedData() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as count FROM commands', (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row.count > 0) {
          resolve();
          return;
        }

        const defaultCommands = [
          { name: '*IDN?', scpi: '*IDN?', description: 'Query instrument identification', category: 'Common', is_query: 1 },
          { name: '*RST', scpi: '*RST', description: 'Reset instrument', category: 'Common', is_query: 0 },
          { name: '*CLS', scpi: '*CLS', description: 'Clear status', category: 'Common', is_query: 0 },
          { name: '*OPC?', scpi: '*OPC?', description: 'Query operation complete', category: 'Common', is_query: 1 },
          { name: 'MEAS:VOLT?', scpi: 'MEAS:VOLT?', description: 'Measure voltage', category: 'Measurement', is_query: 1 },
          { name: 'MEAS:CURR?', scpi: 'MEAS:CURR?', description: 'Measure current', category: 'Measurement', is_query: 1 },
          { name: 'OUTP ON', scpi: 'OUTP ON', description: 'Turn output on', category: 'Output', is_query: 0 },
          { name: 'OUTP OFF', scpi: 'OUTP OFF', description: 'Turn output off', category: 'Output', is_query: 0 },
          { name: 'VOLT', scpi: 'VOLT', description: 'Set voltage', category: 'Source', is_query: 0, params: '[{"name":"value","type":"number"}]' },
          { name: 'CURR', scpi: 'CURR', description: 'Set current limit', category: 'Source', is_query: 0, params: '[{"name":"value","type":"number"}]' },
          { name: 'SYST:ERR?', scpi: 'SYST:ERR?', description: 'Query error message', category: 'System', is_query: 1 },
          { name: 'TRIG', scpi: 'TRIG', description: 'Trigger measurement', category: 'Trigger', is_query: 0 }
        ];

        const stmt = this.db.prepare(`
          INSERT INTO commands (name, scpi, description, category, is_query, params)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        this.db.serialize(() => {
          defaultCommands.forEach(cmd => {
            stmt.run(cmd.name, cmd.scpi, cmd.description, cmd.category, cmd.is_query, cmd.params);
          });
          stmt.finalize();
          resolve();
        });
      });
    });
  }

  getAllCommands() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM commands ORDER BY category, name', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getCommandsByCategory(category) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM commands WHERE category = ? ORDER BY name', [category], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getCommandById(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM commands WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  addCommand(command) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO commands (name, scpi, description, category, is_query, params)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(command.name, command.scpi, command.description, command.category, command.is_query, command.params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...command });
        }
        stmt.finalize();
      });
    });
  }

  updateCommand(id, command) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        UPDATE commands 
        SET name = ?, scpi = ?, description = ?, category = ?, is_query = ?, params = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(command.name, command.scpi, command.description, command.category, command.is_query, command.params, id, function(err) {
        if (err) reject(err);
        else resolve({ id, ...command });
        stmt.finalize();
      });
    });
  }

  deleteCommand(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM commands WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  }

  getAllSequences() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM sequences ORDER BY name', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getSequenceById(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM sequences WHERE id = ?', [id], (err, sequence) => {
        if (err) {
          reject(err);
          return;
        }
        if (!sequence) {
          resolve(null);
          return;
        }
        this.db.all('SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_order', [id], (err, steps) => {
          if (err) reject(err);
          else resolve({ ...sequence, steps });
        });
      });
    });
  }

  addSequence(sequence) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO sequences (name, description, language, code)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(sequence.name, sequence.description, sequence.language, sequence.code, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...sequence });
        }
        stmt.finalize();
      });
    });
  }

  updateSequence(id, sequence) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        UPDATE sequences 
        SET name = ?, description = ?, language = ?, code = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(sequence.name, sequence.description, sequence.language, sequence.code, id, function(err) {
        if (err) reject(err);
        else resolve({ id, ...sequence });
        stmt.finalize();
      });
    });
  }

  deleteSequence(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM sequences WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  }

  createTestRun(sequenceId, name, deviceId) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO test_runs (sequence_id, name, device_id, status)
        VALUES (?, ?, ?, 'running')
      `);
      stmt.run(sequenceId, name, deviceId, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
        stmt.finalize();
      });
    });
  }

  finishTestRun(testRunId, status, total, passed, failed) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        UPDATE test_runs 
        SET status = ?, finished_at = CURRENT_TIMESTAMP,
            total_tests = ?, passed_tests = ?, failed_tests = ?
        WHERE id = ?
      `);
      stmt.run(status, total, passed, failed, testRunId, function(err) {
        if (err) reject(err);
        else resolve({ success: true });
        stmt.finalize();
      });
    });
  }

  addTestResult(testRunId, result) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO test_results (test_run_id, name, command, measured_value, unit, 
                                   min_limit, max_limit, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(testRunId, result.name, result.command, result.measuredValue, result.unit,
               result.minLimit, result.maxLimit, result.status, result.errorMessage, 
               function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
        stmt.finalize();
      });
    });
  }

  getTestRun(testRunId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM test_runs WHERE id = ?', [testRunId], (err, run) => {
        if (err) {
          reject(err);
          return;
        }
        if (!run) {
          resolve(null);
          return;
        }
        this.db.all('SELECT * FROM test_results WHERE test_run_id = ?', [testRunId], (err, results) => {
          if (err) reject(err);
          else resolve({ ...run, results });
        });
      });
    });
  }

  getAllTestRuns(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM test_runs ORDER BY started_at DESC LIMIT ?', [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  addMeasurement(deviceId, command, value, unit) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO measurement_history (device_id, command, value, unit)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(deviceId, command, value, unit, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
        stmt.finalize();
      });
    });
  }

  getMeasurementHistory(deviceId, command, limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM measurement_history 
        WHERE device_id = ? AND command = ? 
        ORDER BY created_at DESC LIMIT ?
      `, [deviceId, command, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.reverse());
      });
    });
  }

  deleteTestRun(testRunId) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM test_runs WHERE id = ?', [testRunId], (err) => {
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = InstrumentDatabase;
