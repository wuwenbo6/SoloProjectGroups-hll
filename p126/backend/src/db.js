const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../database/circuits.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS circuits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      netlist TEXT,
      circuit_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS simulations (
      id TEXT PRIMARY KEY,
      circuit_id TEXT,
      netlist TEXT,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (circuit_id) REFERENCES circuits(id)
    )
  `);
});

function getAllCircuits() {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, name, description, created_at, updated_at FROM circuits ORDER BY updated_at DESC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getCircuitById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM circuits WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function createCircuit(id, name, description, netlist, circuitData) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO circuits (id, name, description, netlist, circuit_data) VALUES (?, ?, ?, ?, ?)',
      [id, name, description, netlist, circuitData],
      function (err) {
        if (err) reject(err);
        else resolve({ id, name, description, netlist, circuit_data: circuitData });
      }
    );
  });
}

function updateCircuit(id, name, description, netlist, circuitData) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE circuits SET name = ?, description = ?, netlist = ?, circuit_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description, netlist, circuitData, id],
      function (err) {
        if (err) reject(err);
        else resolve({ id, name, description, netlist, circuit_data: circuitData });
      }
    );
  });
}

function deleteCircuit(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM circuits WHERE id = ?', [id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function createSimulation(id, circuitId, netlist, result) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO simulations (id, circuit_id, netlist, result) VALUES (?, ?, ?, ?)',
      [id, circuitId, netlist, JSON.stringify(result)],
      function (err) {
        if (err) reject(err);
        else resolve({ id, circuitId, netlist, result });
      }
    );
  });
}

module.exports = {
  db,
  getAllCircuits,
  getCircuitById,
  createCircuit,
  updateCircuit,
  deleteCircuit,
  createSimulation
};
