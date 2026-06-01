import { getDb } from '../data/database';
import { SystemConfig } from '../../shared/types';

class ConfigService {
  public getConfig(): SystemConfig {
    const db = getDb();
    const rows = db.prepare('SELECT config_key, config_value FROM system_config').all() as Array<{ config_key: string; config_value: string }>;
    
    const configMap: Record<string, string> = {};
    for (const row of rows) {
      configMap[row.config_key] = row.config_value;
    }
    
    return {
      opcuaPort: parseInt(configMap.opcua_port || '4840', 10),
      opcuaEndpoint: configMap.opcua_endpoint || '/OPCUA/Server',
      databasePath: configMap.database_path || './data/database.sqlite',
      autoStart: configMap.auto_start === 'true',
      historyEnabled: configMap.history_enabled !== 'false',
      historyRetentionDays: parseInt(configMap.history_retention_days || '30', 10),
      syncEnabled: configMap.sync_enabled !== 'false',
      syncIntervalMs: parseInt(configMap.sync_interval_ms || '1000', 10),
    };
  }

  public updateConfig(config: Partial<SystemConfig>): void {
    const db = getDb();
    const updateStmt = db.prepare(
      'INSERT INTO system_config (config_key, config_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value, updated_at = CURRENT_TIMESTAMP'
    );

    const tx = db.transaction(() => {
      if (config.opcuaPort !== undefined) {
        updateStmt.run('opcua_port', String(config.opcuaPort));
      }
      if (config.opcuaEndpoint !== undefined) {
        updateStmt.run('opcua_endpoint', config.opcuaEndpoint);
      }
      if (config.databasePath !== undefined) {
        updateStmt.run('database_path', config.databasePath);
      }
      if (config.autoStart !== undefined) {
        updateStmt.run('auto_start', String(config.autoStart));
      }
      if (config.historyEnabled !== undefined) {
        updateStmt.run('history_enabled', String(config.historyEnabled));
      }
      if (config.historyRetentionDays !== undefined) {
        updateStmt.run('history_retention_days', String(config.historyRetentionDays));
      }
      if (config.syncEnabled !== undefined) {
        updateStmt.run('sync_enabled', String(config.syncEnabled));
      }
      if (config.syncIntervalMs !== undefined) {
        updateStmt.run('sync_interval_ms', String(config.syncIntervalMs));
      }
    });

    tx();
  }

  public getValue(key: string): string | null {
    const db = getDb();
    const row = db.prepare('SELECT config_value FROM system_config WHERE config_key = ?').get(key) as { config_value: string } | undefined;
    return row?.config_value ?? null;
  }

  public setValue(key: string, value: string): void {
    const db = getDb();
    db.prepare(
      'INSERT INTO system_config (config_key, config_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value, updated_at = CURRENT_TIMESTAMP'
    ).run(key, value);
  }
}

export const configService = new ConfigService();
