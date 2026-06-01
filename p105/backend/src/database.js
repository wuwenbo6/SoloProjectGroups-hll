const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/kvm_backup.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('数据库连接成功');
    initTables();
  }
});

function initTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS vms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      uuid TEXT,
      status TEXT DEFAULT 'stopped',
      disk_path TEXT,
      os_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vm_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      snapshot_name TEXT,
      parent_id INTEGER,
      disk_path TEXT,
      backup_path TEXT,
      size INTEGER,
      changed_blocks INTEGER,
      checksum TEXT,
      checksum_algorithm TEXT DEFAULT 'sha256',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vm_id) REFERENCES vms(id),
      FOREIGN KEY (parent_id) REFERENCES backups(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mount_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_id INTEGER NOT NULL,
      mount_path TEXT NOT NULL,
      status TEXT DEFAULT 'unmounted',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (backup_id) REFERENCES backups(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS backup_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vm_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'incremental',
      cron_expression TEXT NOT NULL,
      retention_count INTEGER DEFAULT 7,
      full_backup_interval INTEGER DEFAULT 7,
      enabled BOOLEAN DEFAULT 1,
      last_run DATETIME,
      next_run DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vm_id) REFERENCES vms(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS remote_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'scp',
      host TEXT NOT NULL,
      port INTEGER DEFAULT 22,
      username TEXT NOT NULL,
      password TEXT,
      private_key_path TEXT,
      remote_path TEXT NOT NULL,
      enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS remote_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_id INTEGER NOT NULL,
      config_id INTEGER NOT NULL,
      remote_path TEXT NOT NULL,
      size INTEGER,
      checksum TEXT,
      status TEXT DEFAULT 'pending',
      transferred_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (backup_id) REFERENCES backups(id),
      FOREIGN KEY (config_id) REFERENCES remote_configs(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS policy_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_id INTEGER NOT NULL,
      backup_id INTEGER,
      status TEXT NOT NULL,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (policy_id) REFERENCES backup_policies(id),
      FOREIGN KEY (backup_id) REFERENCES backups(id)
    )
  `);

  console.log('数据库表初始化完成');
}

module.exports = db;
