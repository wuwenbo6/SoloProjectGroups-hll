const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/devices.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT,
      endpoint TEXT UNIQUE,
      status TEXT DEFAULT 'offline',
      latitude REAL,
      longitude REAL,
      last_seen DATETIME,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      lifetime INTEGER DEFAULT 86400
    )
  `);

  db.run(`ALTER TABLE devices ADD COLUMN registration_params TEXT`, (err) => {});
  db.run(`ALTER TABLE devices ADD COLUMN is_sleeping INTEGER DEFAULT 0`, (err) => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS observers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      resource_path TEXT,
      token TEXT,
      content_format TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_notify DATETIME,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (device_id) REFERENCES devices(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sensor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      temperature REAL,
      latitude REAL,
      longitude REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      command TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      executed_at DATETIME,
      FOREIGN KEY (device_id) REFERENCES devices(id)
    )
  `);

  db.run(`ALTER TABLE commands ADD COLUMN payload TEXT`, (err) => {});
  db.run(`ALTER TABLE commands ADD COLUMN priority INTEGER DEFAULT 0`, (err) => {});
  db.run(`ALTER TABLE commands ADD COLUMN retry_count INTEGER DEFAULT 0`, (err) => {});
  db.run(`ALTER TABLE commands ADD COLUMN max_retries INTEGER DEFAULT 3`, (err) => {});
  db.run(`ALTER TABLE commands ADD COLUMN acknowledged_at DATETIME`, (err) => {});
  db.run(`ALTER TABLE commands ADD COLUMN error_message TEXT`, (err) => {});

  db.run(`CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_observers_device ON observers(device_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS firmware (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT UNIQUE,
      name TEXT,
      description TEXT,
      file_path TEXT,
      file_size INTEGER,
      checksum TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS firmware_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      firmware_id INTEGER,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      started_at DATETIME,
      completed_at DATETIME,
      error_message TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id),
      FOREIGN KEY (firmware_id) REFERENCES firmware(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      url TEXT,
      method TEXT DEFAULT 'POST',
      headers TEXT,
      events TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS device_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      level TEXT DEFAULT 'info',
      message TEXT,
      data TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_firmware_updates_device ON firmware_updates(device_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_firmware_updates_status ON firmware_updates(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_device_logs_device ON device_logs(device_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_device_logs_timestamp ON device_logs(timestamp)`);
});

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

async function registerDevice(endpoint, name = null, registrationParams = null) {
  const id = endpoint;
  const existing = await getQuery('SELECT id, is_sleeping FROM devices WHERE id = ?', [id]);
  
  const paramsStr = registrationParams ? JSON.stringify(registrationParams) : null;
  
  if (existing) {
    await runQuery(
      'UPDATE devices SET status = ?, last_seen = CURRENT_TIMESTAMP, is_sleeping = 0, registration_params = COALESCE(?, registration_params) WHERE id = ?',
      ['online', paramsStr, id]
    );
  } else {
    await runQuery(
      'INSERT INTO devices (id, endpoint, name, status, last_seen, registration_params) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)',
      [id, endpoint, name || endpoint, 'online', paramsStr]
    );
  }
  return getDevice(id);
}

async function markDeviceSleeping(endpoint) {
  return runQuery(
    'UPDATE devices SET is_sleeping = 1, status = ? WHERE endpoint = ?',
    ['sleeping', endpoint]
  );
}

async function wakeupDevice(endpoint) {
  const device = await getDeviceByEndpoint(endpoint);
  if (device) {
    await runQuery(
      'UPDATE devices SET is_sleeping = 0, status = ?, last_seen = CURRENT_TIMESTAMP WHERE endpoint = ?',
      ['online', endpoint]
    );
    const pendingCommands = await getPendingCommandsForDelivery(device.id);
    return {
      device: await getDevice(device.id),
      pendingCommands,
      observers: await getActiveObservers(device.id)
    };
  }
  return null;
}

async function updateDeviceStatus(endpoint, status) {
  return runQuery(
    'UPDATE devices SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE endpoint = ?',
    [status, endpoint]
  );
}

async function updateDeviceLocation(endpoint, lat, lng) {
  return runQuery(
    'UPDATE devices SET latitude = ?, longitude = ?, last_seen = CURRENT_TIMESTAMP WHERE endpoint = ?',
    [lat, lng, endpoint]
  );
}

async function getDevice(id) {
  return getQuery('SELECT * FROM devices WHERE id = ?', [id]);
}

async function getDeviceByEndpoint(endpoint) {
  return getQuery('SELECT * FROM devices WHERE endpoint = ?', [endpoint]);
}

async function getAllDevices() {
  return allQuery('SELECT * FROM devices ORDER BY last_seen DESC');
}

async function addObserver(deviceId, resourcePath, token, contentFormat = null) {
  return runQuery(
    'INSERT INTO observers (device_id, resource_path, token, content_format, last_notify) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [deviceId, resourcePath, token, contentFormat]
  );
}

async function getActiveObservers(deviceId) {
  return allQuery(
    'SELECT * FROM observers WHERE device_id = ? AND is_active = 1',
    [deviceId]
  );
}

async function updateObserverLastNotify(observerId) {
  return runQuery(
    'UPDATE observers SET last_notify = CURRENT_TIMESTAMP WHERE id = ?',
    [observerId]
  );
}

async function removeObserver(deviceId, resourcePath, token) {
  return runQuery(
    'UPDATE observers SET is_active = 0 WHERE device_id = ? AND resource_path = ? AND token = ?',
    [deviceId, resourcePath, token]
  );
}

async function insertSensorData(deviceId, temperature, latitude, longitude) {
  return runQuery(
    'INSERT INTO sensor_data (device_id, temperature, latitude, longitude) VALUES (?, ?, ?, ?)',
    [deviceId, temperature, latitude, longitude]
  );
}

async function getSensorData(deviceId, limit = 100) {
  return allQuery(
    'SELECT * FROM sensor_data WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?',
    [deviceId, limit]
  );
}

async function createCommand(deviceId, command, payload = null, priority = 0, maxRetries = 3) {
  return runQuery(
    'INSERT INTO commands (device_id, command, payload, priority, max_retries) VALUES (?, ?, ?, ?, ?)',
    [deviceId, command, payload ? JSON.stringify(payload) : null, priority, maxRetries]
  );
}

async function createBatchCommands(devices, command, payload = null, priority = 0) {
  const results = [];
  for (const deviceId of devices) {
    const result = await createCommand(deviceId, command, payload, priority);
    results.push({ deviceId, commandId: result.lastID });
  }
  return results;
}

async function getPendingCommands(deviceId) {
  return allQuery(
    'SELECT * FROM commands WHERE device_id = ? AND status IN (?, ?) ORDER BY priority DESC, created_at ASC',
    [deviceId, 'pending', 'retry']
  );
}

async function getPendingCommandsForDelivery(deviceId) {
  return allQuery(
    'SELECT * FROM commands WHERE device_id = ? AND status IN (?, ?) ORDER BY priority DESC, created_at ASC LIMIT 10',
    [deviceId, 'pending', 'retry']
  );
}

async function markCommandDelivering(commandId) {
  return runQuery(
    'UPDATE commands SET status = ? WHERE id = ?',
    ['delivering', commandId]
  );
}

async function acknowledgeCommand(commandId) {
  return runQuery(
    'UPDATE commands SET status = ?, acknowledged_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['executed', commandId]
  );
}

async function retryCommand(commandId) {
  const cmd = await getQuery('SELECT retry_count, max_retries FROM commands WHERE id = ?', [commandId]);
  if (cmd && cmd.retry_count < cmd.max_retries) {
    return runQuery(
      'UPDATE commands SET status = ?, retry_count = retry_count + 1 WHERE id = ?',
      ['retry', commandId]
    );
  } else {
    return runQuery(
      'UPDATE commands SET status = ?, error_message = ? WHERE id = ?',
      ['failed', 'Max retries exceeded', commandId]
    );
  }
}

async function failCommand(commandId, errorMessage) {
  return runQuery(
    'UPDATE commands SET status = ?, error_message = ? WHERE id = ?',
    ['failed', errorMessage, commandId]
  );
}

async function executeCommand(commandId) {
  return runQuery(
    'UPDATE commands SET status = ?, executed_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['executed', commandId]
  );
}

async function getStaleCommands(timeoutMs = 300000) {
  const timeoutSec = Math.floor(timeoutMs / 1000);
  return allQuery(`
    SELECT * FROM commands 
    WHERE status = ? 
    AND strftime('%s', 'now') - strftime('%s', created_at) > ?
    AND retry_count < max_retries
  `, ['delivering', timeoutSec]);
}

async function getAllCommands(limit = 50) {
  return allQuery(
    'SELECT * FROM commands ORDER BY created_at DESC LIMIT ?',
    [limit]
  );
}

async function getCommandsByStatus(status, limit = 50) {
  return allQuery(
    'SELECT * FROM commands WHERE status = ? ORDER BY created_at DESC LIMIT ?',
    [status, limit]
  );
}

async function deregisterDevice(endpoint) {
  await runQuery('UPDATE devices SET status = ? WHERE endpoint = ?', ['deregistered', endpoint]);
  await runQuery('UPDATE observers SET is_active = 0 WHERE device_id = (SELECT id FROM devices WHERE endpoint = ?)', [endpoint]);
}

async function addFirmware(version, name, description, filePath, fileSize, checksum) {
  return runQuery(
    'INSERT INTO firmware (version, name, description, file_path, file_size, checksum) VALUES (?, ?, ?, ?, ?, ?)',
    [version, name, description, filePath, fileSize, checksum]
  );
}

async function getActiveFirmware() {
  return getQuery('SELECT * FROM firmware WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1');
}

async function getAllFirmware(limit = 20) {
  return allQuery('SELECT * FROM firmware ORDER BY created_at DESC LIMIT ?', [limit]);
}

async function setActiveFirmware(firmwareId) {
  await runQuery('UPDATE firmware SET is_active = 0');
  return runQuery('UPDATE firmware SET is_active = 1 WHERE id = ?', [firmwareId]);
}

async function getFirmware(firmwareId) {
  return getQuery('SELECT * FROM firmware WHERE id = ?', [firmwareId]);
}

async function createFirmwareUpdate(deviceId, firmwareId) {
  return runQuery(
    'INSERT INTO firmware_updates (device_id, firmware_id, status, started_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
    [deviceId, firmwareId, 'downloading']
  );
}

async function updateFirmwareProgress(updateId, progress) {
  if (progress >= 100) {
    return runQuery(
      'UPDATE firmware_updates SET progress = ?, status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [progress, 'completed', updateId]
    );
  }
  return runQuery(
    'UPDATE firmware_updates SET progress = ? WHERE id = ?',
    [progress, updateId]
  );
}

async function failFirmwareUpdate(updateId, errorMessage) {
  return runQuery(
    'UPDATE firmware_updates SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['failed', errorMessage, updateId]
  );
}

async function getDeviceFirmwareUpdates(deviceId, limit = 10) {
  return allQuery(
    'SELECT fu.*, f.version, f.name FROM firmware_updates fu JOIN firmware f ON fu.firmware_id = f.id WHERE fu.device_id = ? ORDER BY fu.started_at DESC LIMIT ?',
    [deviceId, limit]
  );
}

async function addWebhook(name, url, method = 'POST', headers = {}, events = []) {
  return runQuery(
    'INSERT INTO webhooks (name, url, method, headers, events) VALUES (?, ?, ?, ?, ?)',
    [name, url, method, JSON.stringify(headers), JSON.stringify(events)]
  );
}

async function getActiveWebhooks() {
  return allQuery('SELECT * FROM webhooks WHERE is_active = 1');
}

async function getAllWebhooks() {
  return allQuery('SELECT * FROM webhooks ORDER BY created_at DESC');
}

async function deleteWebhook(webhookId) {
  return runQuery('DELETE FROM webhooks WHERE id = ?', [webhookId]);
}

async function addDeviceLog(deviceId, level, message, data = null) {
  return runQuery(
    'INSERT INTO device_logs (device_id, level, message, data) VALUES (?, ?, ?, ?)',
    [deviceId, level, message, data ? JSON.stringify(data) : null]
  );
}

async function getDeviceLogs(deviceId, limit = 100, level = null) {
  if (level) {
    return allQuery(
      'SELECT * FROM device_logs WHERE device_id = ? AND level = ? ORDER BY timestamp DESC LIMIT ?',
      [deviceId, level, limit]
    );
  }
  return allQuery(
    'SELECT * FROM device_logs WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?',
    [deviceId, limit]
  );
}

async function getLogsByTimeRange(deviceId, startTime, endTime) {
  return allQuery(
    'SELECT * FROM device_logs WHERE device_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC',
    [deviceId, startTime, endTime]
  );
}

async function getAllDeviceLogs(limit = 500) {
  return allQuery(
    'SELECT dl.*, d.name as device_name FROM device_logs dl JOIN devices d ON dl.device_id = d.id ORDER BY dl.timestamp DESC LIMIT ?',
    [limit]
  );
}

module.exports = {
  registerDevice,
  markDeviceSleeping,
  wakeupDevice,
  updateDeviceStatus,
  updateDeviceLocation,
  getDevice,
  getDeviceByEndpoint,
  getAllDevices,
  addObserver,
  getActiveObservers,
  updateObserverLastNotify,
  removeObserver,
  insertSensorData,
  getSensorData,
  createCommand,
  createBatchCommands,
  getPendingCommands,
  getPendingCommandsForDelivery,
  markCommandDelivering,
  acknowledgeCommand,
  retryCommand,
  failCommand,
  executeCommand,
  getStaleCommands,
  getAllCommands,
  getCommandsByStatus,
  deregisterDevice,
  addFirmware,
  getActiveFirmware,
  getAllFirmware,
  setActiveFirmware,
  getFirmware,
  createFirmwareUpdate,
  updateFirmwareProgress,
  failFirmwareUpdate,
  getDeviceFirmwareUpdates,
  addWebhook,
  getActiveWebhooks,
  getAllWebhooks,
  deleteWebhook,
  addDeviceLog,
  getDeviceLogs,
  getLogsByTimeRange,
  getAllDeviceLogs
};
