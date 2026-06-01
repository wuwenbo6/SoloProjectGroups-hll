CREATE TABLE IF NOT EXISTS mapping_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_name TEXT NOT NULL,
  register_type TEXT NOT NULL,
  register_address INTEGER NOT NULL,
  data_type TEXT NOT NULL,
  opcua_node_id TEXT NOT NULL UNIQUE,
  opcua_browse_name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  port INTEGER DEFAULT 502,
  slave_id INTEGER DEFAULT 1,
  description TEXT,
  enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES
  ('opcua_port', '4840'),
  ('opcua_endpoint', '/OPCUA/Server'),
  ('database_path', './data/database.sqlite'),
  ('auto_start', 'false');

CREATE INDEX IF NOT EXISTS idx_mapping_rules_device ON mapping_rules(device_name);
CREATE INDEX IF NOT EXISTS idx_mapping_rules_register ON mapping_rules(register_type, register_address);
