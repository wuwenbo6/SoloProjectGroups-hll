CREATE TABLE IF NOT EXISTS node_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  browse_name TEXT NOT NULL,
  value TEXT NOT NULL,
  quality TEXT DEFAULT 'Good',
  source_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL CHECK(direction IN ('UA_TO_MODBUS', 'MODBUS_TO_UA')),
  node_id TEXT NOT NULL,
  register_type TEXT NOT NULL,
  register_address INTEGER NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  error_message TEXT,
  synced_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_node_history_node ON node_history(node_id);
CREATE INDEX IF NOT EXISTS idx_node_history_timestamp ON node_history(source_timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status);
CREATE INDEX IF NOT EXISTS idx_sync_log_direction ON sync_log(direction);

INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES
  ('history_enabled', 'true'),
  ('history_retention_days', '30'),
  ('sync_enabled', 'true'),
  ('sync_interval_ms', '1000');
