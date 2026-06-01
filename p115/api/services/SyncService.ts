import { getDb } from '../data/database';
import { mappingService } from './MappingService';
import { historyService } from './HistoryService';
import { configService } from './ConfigService';
import { SyncLog, SyncStatus } from '../../shared/types';

class SyncService {
  private syncTimer: NodeJS.Timeout | null = null;
  private lastSyncTime: Date | null = null;

  public startSync(): { success: boolean; message: string } {
    if (this.syncTimer) {
      return { success: false, message: '同步服务已在运行' };
    }

    const config = configService.getConfig();
    const syncInterval = config.syncIntervalMs || 1000;

    this.syncTimer = setInterval(() => {
      this.processPendingSyncs();
    }, syncInterval);

    this.lastSyncTime = new Date();
    return { success: true, message: `双向同步服务已启动，间隔: ${syncInterval}ms` };
  }

  public stopSync(): { success: boolean; message: string } {
    if (!this.syncTimer) {
      return { success: false, message: '同步服务未运行' };
    }

    clearInterval(this.syncTimer);
    this.syncTimer = null;
    return { success: true, message: '双向同步服务已停止' };
  }

  public getSyncStatus(): SyncStatus {
    const db = getDb();
    
    const pending = db.prepare("SELECT COUNT(*) as count FROM sync_log WHERE status = 'PENDING'").get() as { count: number };
    const success = db.prepare("SELECT COUNT(*) as count FROM sync_log WHERE status = 'SUCCESS'").get() as { count: number };
    const failed = db.prepare("SELECT COUNT(*) as count FROM sync_log WHERE status = 'FAILED'").get() as { count: number };
    
    const config = configService.getConfig();
    
    return {
      enabled: config.syncEnabled,
      lastSyncTime: this.lastSyncTime?.toISOString() || null,
      pendingCount: pending.count,
      successCount: success.count,
      failedCount: failed.count,
    };
  }

  public syncFromModbusToUa(): { success: boolean; syncedCount: number; errors: string[] } {
    const rules = mappingService.getAllRules();
    const errors: string[] = [];
    let syncedCount = 0;

    for (const rule of rules) {
      try {
        const value = this.simulateModbusRead(rule.registerType, rule.registerAddress);
        
        this.logSync('MODBUS_TO_UA', rule.opcuaNodeId, rule.registerType, rule.registerAddress, null, String(value), 'SUCCESS');
        
        historyService.recordHistory(rule.opcuaNodeId, rule.opcuaBrowseName, value);
        
        syncedCount++;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        errors.push(`[${rule.deviceName}] ${rule.registerType}:${rule.registerAddress} - ${errorMsg}`);
        
        this.logSync('MODBUS_TO_UA', rule.opcuaNodeId, rule.registerType, rule.registerAddress, null, '', 'FAILED', errorMsg);
      }
    }

    this.lastSyncTime = new Date();
    return { success: errors.length === 0, syncedCount, errors };
  }

  public syncFromUaToModbus(nodeId: string, value: any): { success: boolean; message?: string } {
    const rule = mappingService.getAllRules().find(r => r.opcuaNodeId === nodeId);
    if (!rule) {
      return { success: false, message: '节点不存在' };
    }

    if (rule.registerType === 'InputRegister' || rule.registerType === 'DiscreteInput') {
      return { success: false, message: `${rule.registerType} 是只读类型，无法写入` };
    }

    try {
      const oldValue = this.simulateModbusRead(rule.registerType, rule.registerAddress);
      
      this.simulateModbusWrite(rule.registerType, rule.registerAddress, value);
      
      this.logSync('UA_TO_MODBUS', nodeId, rule.registerType, rule.registerAddress, String(oldValue), String(value), 'SUCCESS');
      
      historyService.recordHistory(nodeId, rule.opcuaBrowseName, value);
      
      this.lastSyncTime = new Date();
      return { success: true };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.logSync('UA_TO_MODBUS', nodeId, rule.registerType, rule.registerAddress, null, String(value), 'FAILED', errorMsg);
      return { success: false, message: errorMsg };
    }
  }

  public getSyncLogs(limit: number = 100, status?: string): SyncLog[] {
    const db = getDb();
    let sql = `
      SELECT id, direction, node_id, register_type, register_address, old_value, new_value, status, error_message, synced_at, created_at
      FROM sync_log
    `;
    
    const params: any[] = [];
    
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(this.rowToSyncLog);
  }

  public retryFailedSyncs(): { success: boolean; retriedCount: number; errors: string[] } {
    const db = getDb();
    const failedLogs = db.prepare("SELECT * FROM sync_log WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT 100").all() as any[];
    
    const errors: string[] = [];
    let retriedCount = 0;

    for (const log of failedLogs) {
      try {
        if (log.direction === 'UA_TO_MODBUS') {
          const value = this.parseValue(log.new_value);
          this.syncFromUaToModbus(log.node_id, value);
        } else {
          this.syncFromModbusToUa();
        }
        
        db.prepare("UPDATE sync_log SET status = 'SUCCESS', synced_at = datetime('now') WHERE id = ?").run(log.id);
        retriedCount++;
      } catch (e) {
        errors.push(`ID ${log.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { success: errors.length === 0, retriedCount, errors };
  }

  public cleanupOldLogs(daysToKeep: number = 30): number {
    const db = getDb();
    const result = db.prepare(`
      DELETE FROM sync_log
      WHERE created_at < datetime('now', ?)
    `).run(`-${daysToKeep} days`);
    
    return result.changes;
  }

  private processPendingSyncs(): void {
    const db = getDb();
    const pendingLogs = db.prepare("SELECT * FROM sync_log WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 100").all() as any[];

    for (const log of pendingLogs) {
      try {
        if (log.direction === 'UA_TO_MODBUS') {
          const value = this.parseValue(log.new_value);
          this.syncFromUaToModbus(log.node_id, value);
        }
      } catch (e) {
        db.prepare("UPDATE sync_log SET status = 'FAILED', error_message = ?, synced_at = datetime('now') WHERE id = ?")
          .run(e instanceof Error ? e.message : String(e), log.id);
      }
    }
  }

  private simulateModbusRead(registerType: string, address: number): any {
    const time = Date.now() / 1000;
    
    switch (registerType) {
      case 'Coil':
      case 'DiscreteInput':
        return Math.random() > 0.5;
      case 'InputRegister':
      case 'HoldingRegister':
        return Math.floor(Math.sin(time + address) * 10000) / 100;
      default:
        return 0;
    }
  }

  private simulateModbusWrite(registerType: string, address: number, value: any): void {
    console.log(`[MODBUS Write] ${registerType}:${address} = ${value}`);
  }

  private parseValue(valueStr: string): any {
    try {
      return JSON.parse(valueStr);
    } catch {
      if (valueStr === 'true') return true;
      if (valueStr === 'false') return false;
      if (!isNaN(Number(valueStr))) return Number(valueStr);
      return valueStr;
    }
  }

  private logSync(
    direction: 'UA_TO_MODBUS' | 'MODBUS_TO_UA',
    nodeId: string,
    registerType: string,
    registerAddress: number,
    oldValue: string | null,
    newValue: string,
    status: 'PENDING' | 'SUCCESS' | 'FAILED',
    errorMessage?: string
  ): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO sync_log (direction, node_id, register_type, register_address, old_value, new_value, status, error_message, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(direction, nodeId, registerType, registerAddress, oldValue, newValue, status, errorMessage || null);
  }

  private rowToSyncLog(row: any): SyncLog {
    return {
      id: row.id,
      direction: row.direction,
      nodeId: row.node_id,
      registerType: row.register_type,
      registerAddress: row.register_address,
      oldValue: row.old_value || undefined,
      newValue: row.new_value,
      status: row.status,
      errorMessage: row.error_message || undefined,
      syncedAt: row.synced_at || undefined,
      createdAt: row.created_at,
    };
  }
}

export const syncService = new SyncService();
