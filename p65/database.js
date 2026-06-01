const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'webauthn.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS authenticators (
      credential_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      credential_public_key BLOB NOT NULL,
      counter INTEGER DEFAULT 0,
      credential_device_type TEXT,
      credential_backed_up INTEGER DEFAULT 0,
      transports TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recovery_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      code_prefix TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      used_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT,
      ip_address TEXT,
      user_agent TEXT,
      risk_score INTEGER DEFAULT 0,
      risk_details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_ips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, ip_address),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
});

function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getUserById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function createUser(id, username) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO users (id, username) VALUES (?, ?)', [id, username], function(err) {
      if (err) reject(err);
      else resolve({ id, username });
    });
  });
}

function getAuthenticatorsByUserId(userId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM authenticators WHERE user_id = ?', [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(row => ({
        ...row,
        credential_public_key: Buffer.from(row.credential_public_key),
        transports: row.transports ? JSON.parse(row.transports) : [],
        credential_backed_up: !!row.credential_backed_up
      })));
    });
  });
}

function getAuthenticatorByCredentialId(credentialId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM authenticators WHERE credential_id = ?', [credentialId], (err, row) => {
      if (err) reject(err);
      else if (row) {
        resolve({
          ...row,
          credential_public_key: Buffer.from(row.credential_public_key),
          transports: row.transports ? JSON.parse(row.transports) : [],
          credential_backed_up: !!row.credential_backed_up
        });
      } else {
        resolve(null);
      }
    });
  });
}

function saveAuthenticator(userId, authenticator) {
  return new Promise((resolve, reject) => {
    const {
      credentialID,
      credentialPublicKey,
      counter,
      credentialDeviceType,
      credentialBackedUp,
      transports
    } = authenticator;

    db.run(`
      INSERT INTO authenticators (
        credential_id, user_id, credential_public_key, counter,
        credential_device_type, credential_backed_up, transports, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      credentialID,
      userId,
      credentialPublicKey,
      counter,
      credentialDeviceType,
      credentialBackedUp ? 1 : 0,
      JSON.stringify(transports || [])
    ], function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

function updateAuthenticatorCounter(credentialId, counter) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE authenticators 
      SET counter = ?, last_used_at = CURRENT_TIMESTAMP 
      WHERE credential_id = ?
    `, [counter, credentialId], function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

function deleteAuthenticator(credentialId, userId) {
  return new Promise((resolve, reject) => {
    db.run(`
      DELETE FROM authenticators 
      WHERE credential_id = ? AND user_id = ?
    `, [credentialId, userId], function(err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}

function saveRecoveryCode(userId, codeHash, codePrefix) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO recovery_codes (user_id, code_hash, code_prefix)
      VALUES (?, ?, ?)
    `, [userId, codeHash, codePrefix], function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function getRecoveryCodesByUserId(userId) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT id, code_prefix, used, created_at, used_at
      FROM recovery_codes 
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getRecoveryCodeByHash(codeHash) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT * FROM recovery_codes 
      WHERE code_hash = ? AND used = 0
    `, [codeHash], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function markRecoveryCodeUsed(id) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE recovery_codes 
      SET used = 1, used_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [id], function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

function deleteRecoveryCodesByUserId(userId) {
  return new Promise((resolve, reject) => {
    db.run(`
      DELETE FROM recovery_codes 
      WHERE user_id = ?
    `, [userId], function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

function addAuditLog(userId, eventType, eventData, ipAddress, userAgent, riskScore = 0, riskDetails = null) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO audit_logs (user_id, event_type, event_data, ip_address, user_agent, risk_score, risk_details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      eventType,
      eventData ? JSON.stringify(eventData) : null,
      ipAddress,
      userAgent,
      riskScore,
      riskDetails ? JSON.stringify(riskDetails) : null
    ], function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function getAuditLogsByUserId(userId, limit = 100) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM audit_logs 
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [userId, limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(row => ({
        ...row,
        event_data: row.event_data ? JSON.parse(row.event_data) : null,
        risk_details: row.risk_details ? JSON.parse(row.risk_details) : null
      })));
    });
  });
}

function getAllAuditLogsByUserId(userId) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM audit_logs 
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(row => ({
        ...row,
        event_data: row.event_data ? JSON.parse(row.event_data) : null,
        risk_details: row.risk_details ? JSON.parse(row.risk_details) : null
      })));
    });
  });
}

function getUserIps(userId) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT ip_address, first_seen, last_seen
      FROM user_ips 
      WHERE user_id = ?
      ORDER BY last_seen DESC
    `, [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function recordUserIp(userId, ipAddress) {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO user_ips (user_id, ip_address, last_seen, first_seen)
      VALUES (?, ?, CURRENT_TIMESTAMP, 
        COALESCE((SELECT first_seen FROM user_ips WHERE user_id = ? AND ip_address = ?), CURRENT_TIMESTAMP)
      )
    `, [userId, ipAddress, userId, ipAddress], function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  getUserByUsername,
  getUserById,
  createUser,
  getAuthenticatorsByUserId,
  getAuthenticatorByCredentialId,
  saveAuthenticator,
  updateAuthenticatorCounter,
  deleteAuthenticator,
  saveRecoveryCode,
  getRecoveryCodesByUserId,
  getRecoveryCodeByHash,
  markRecoveryCodeUsed,
  deleteRecoveryCodesByUserId,
  addAuditLog,
  getAuditLogsByUserId,
  getAllAuditLogsByUserId,
  getUserIps,
  recordUserIp
};
