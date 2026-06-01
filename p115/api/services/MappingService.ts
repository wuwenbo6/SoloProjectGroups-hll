import { getDb } from '../data/database';
import { MappingRule } from '../../shared/types';

class MappingService {
  public isNodeIdExists(nodeId: string, excludeId?: number): boolean {
    const db = getDb();
    let sql = 'SELECT COUNT(*) as count FROM mapping_rules WHERE opcua_node_id = ?';
    const params: any[] = [nodeId];
    if (excludeId !== undefined) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }
    const result = db.prepare(sql).get(...params) as { count: number };
    return result.count > 0;
  }

  public isBrowseNameExists(browseName: string, excludeId?: number): boolean {
    const db = getDb();
    let sql = 'SELECT COUNT(*) as count FROM mapping_rules WHERE opcua_browse_name = ?';
    const params: any[] = [browseName];
    if (excludeId !== undefined) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }
    const result = db.prepare(sql).get(...params) as { count: number };
    return result.count > 0;
  }

  public isDeviceRegisterExists(deviceName: string, registerType: string, registerAddress: number, excludeId?: number): boolean {
    const db = getDb();
    let sql = 'SELECT COUNT(*) as count FROM mapping_rules WHERE device_name = ? AND register_type = ? AND register_address = ?';
    const params: any[] = [deviceName, registerType, registerAddress];
    if (excludeId !== undefined) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }
    const result = db.prepare(sql).get(...params) as { count: number };
    return result.count > 0;
  }

  public generateUniqueNodeId(deviceName: string, registerType: string, address: number): string {
    let suffix = 0;
    let nodeId = `ns=1;s=${deviceName}.${registerType}.${address}`;
    
    while (this.isNodeIdExists(nodeId)) {
      suffix++;
      nodeId = `ns=1;s=${deviceName}.${registerType}.${address}_${suffix}`;
    }
    
    return nodeId;
  }

  public generateUniqueBrowseName(deviceName: string, registerType: string, address: number): string {
    let suffix = 0;
    let browseName = `${deviceName}_${registerType}_${address}`;
    
    while (this.isBrowseNameExists(browseName)) {
      suffix++;
      browseName = `${deviceName}_${registerType}_${address}_${suffix}`;
    }
    
    return browseName;
  }

  public getAllRules(): MappingRule[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM mapping_rules ORDER BY device_name, register_address').all() as any[];
    return rows.map(this.rowToMappingRule);
  }

  public getRulesByDevice(deviceName: string): MappingRule[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM mapping_rules WHERE device_name = ? ORDER BY register_address').all(deviceName) as any[];
    return rows.map(this.rowToMappingRule);
  }

  public getRuleById(id: number): MappingRule | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM mapping_rules WHERE id = ?').get(id) as any;
    return row ? this.rowToMappingRule(row) : null;
  }

  public createRule(rule: Omit<MappingRule, 'id' | 'createdAt' | 'updatedAt'>, autoResolveConflict: boolean = false): number {
    if (this.isDeviceRegisterExists(rule.deviceName, rule.registerType, rule.registerAddress)) {
      throw new Error(`设备 ${rule.deviceName} 的 ${rule.registerType} 地址 ${rule.registerAddress} 已存在映射规则`);
    }
    
    if (this.isNodeIdExists(rule.opcuaNodeId)) {
      if (autoResolveConflict) {
        rule.opcuaNodeId = this.generateUniqueNodeId(rule.deviceName, rule.registerType, rule.registerAddress);
        rule.opcuaBrowseName = this.generateUniqueBrowseName(rule.deviceName, rule.registerType, rule.registerAddress);
      } else {
        throw new Error(`OPC UA 节点ID ${rule.opcuaNodeId} 已存在，请使用唯一的节点ID`);
      }
    }
    
    if (this.isBrowseNameExists(rule.opcuaBrowseName)) {
      if (autoResolveConflict) {
        rule.opcuaBrowseName = this.generateUniqueBrowseName(rule.deviceName, rule.registerType, rule.registerAddress);
      } else {
        throw new Error(`OPC UA 浏览名称 ${rule.opcuaBrowseName} 已存在，请使用唯一的浏览名称`);
      }
    }
    
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO mapping_rules (device_name, register_type, register_address, data_type, opcua_node_id, opcua_browse_name, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      rule.deviceName,
      rule.registerType,
      rule.registerAddress,
      rule.dataType,
      rule.opcuaNodeId,
      rule.opcuaBrowseName,
      rule.description || null
    );
    return Number(result.lastInsertRowid);
  }

  public updateRule(id: number, rule: Partial<MappingRule>, autoResolveConflict: boolean = false): boolean {
    const existingRule = this.getRuleById(id);
    if (!existingRule) {
      throw new Error(`映射规则 ID ${id} 不存在`);
    }
    
    const deviceName = rule.deviceName ?? existingRule.deviceName;
    const registerType = rule.registerType ?? existingRule.registerType;
    const registerAddress = rule.registerAddress ?? existingRule.registerAddress;
    
    if (rule.deviceName !== undefined || rule.registerType !== undefined || rule.registerAddress !== undefined) {
      if (this.isDeviceRegisterExists(deviceName, registerType, registerAddress, id)) {
        throw new Error(`设备 ${deviceName} 的 ${registerType} 地址 ${registerAddress} 已存在映射规则`);
      }
    }
    
    if (rule.opcuaNodeId !== undefined && this.isNodeIdExists(rule.opcuaNodeId, id)) {
      if (autoResolveConflict) {
        rule.opcuaNodeId = this.generateUniqueNodeId(deviceName, registerType, registerAddress);
      } else {
        throw new Error(`OPC UA 节点ID ${rule.opcuaNodeId} 已存在，请使用唯一的节点ID`);
      }
    }
    
    if (rule.opcuaBrowseName !== undefined && this.isBrowseNameExists(rule.opcuaBrowseName, id)) {
      if (autoResolveConflict) {
        rule.opcuaBrowseName = this.generateUniqueBrowseName(deviceName, registerType, registerAddress);
      } else {
        throw new Error(`OPC UA 浏览名称 ${rule.opcuaBrowseName} 已存在，请使用唯一的浏览名称`);
      }
    }
    
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (rule.deviceName !== undefined) {
      fields.push('device_name = ?');
      values.push(rule.deviceName);
    }
    if (rule.registerType !== undefined) {
      fields.push('register_type = ?');
      values.push(rule.registerType);
    }
    if (rule.registerAddress !== undefined) {
      fields.push('register_address = ?');
      values.push(rule.registerAddress);
    }
    if (rule.dataType !== undefined) {
      fields.push('data_type = ?');
      values.push(rule.dataType);
    }
    if (rule.opcuaNodeId !== undefined) {
      fields.push('opcua_node_id = ?');
      values.push(rule.opcuaNodeId);
    }
    if (rule.opcuaBrowseName !== undefined) {
      fields.push('opcua_browse_name = ?');
      values.push(rule.opcuaBrowseName);
    }
    if (rule.description !== undefined) {
      fields.push('description = ?');
      values.push(rule.description);
    }
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = db.prepare(`
      UPDATE mapping_rules SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  }

  public deleteRule(id: number): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM mapping_rules WHERE id = ?').run(id);
    return result.changes > 0;
  }

  public bulkCreateRules(rules: Array<Omit<MappingRule, 'id' | 'createdAt' | 'updatedAt'>>, autoResolveConflict: boolean = true): { success: number; failed: number; errors: string[] } {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO mapping_rules (device_name, register_type, register_address, data_type, opcua_node_id, opcua_browse_name, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const tx = db.transaction((rulesArray: typeof rules) => {
      for (let i = 0; i < rulesArray.length; i++) {
        const rule = rulesArray[i];
        const rowNum = i + 1;
        
        try {
          if (this.isDeviceRegisterExists(rule.deviceName, rule.registerType, rule.registerAddress)) {
            if (autoResolveConflict) {
              errors.push(`第${rowNum}行: 设备 ${rule.deviceName} 的 ${rule.registerType} 地址 ${rule.registerAddress} 已存在，已跳过`);
              failed++;
              continue;
            } else {
              throw new Error(`设备 ${rule.deviceName} 的 ${rule.registerType} 地址 ${rule.registerAddress} 已存在映射规则`);
            }
          }
          
          if (this.isNodeIdExists(rule.opcuaNodeId)) {
            if (autoResolveConflict) {
              rule.opcuaNodeId = this.generateUniqueNodeId(rule.deviceName, rule.registerType, rule.registerAddress);
              rule.opcuaBrowseName = this.generateUniqueBrowseName(rule.deviceName, rule.registerType, rule.registerAddress);
              errors.push(`第${rowNum}行: 节点ID冲突，已自动生成为 ${rule.opcuaNodeId}`);
            } else {
              throw new Error(`OPC UA 节点ID ${rule.opcuaNodeId} 已存在`);
            }
          }
          
          if (this.isBrowseNameExists(rule.opcuaBrowseName)) {
            if (autoResolveConflict) {
              rule.opcuaBrowseName = this.generateUniqueBrowseName(rule.deviceName, rule.registerType, rule.registerAddress);
            } else {
              throw new Error(`OPC UA 浏览名称 ${rule.opcuaBrowseName} 已存在`);
            }
          }
          
          stmt.run(
            rule.deviceName,
            rule.registerType,
            rule.registerAddress,
            rule.dataType,
            rule.opcuaNodeId,
            rule.opcuaBrowseName,
            rule.description || null
          );
          success++;
        } catch (e) {
          failed++;
          errors.push(`第${rowNum}行: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    });

    tx(rules);
    
    return { success, failed, errors };
  }

  public deleteAllRules(): number {
    const db = getDb();
    const result = db.prepare('DELETE FROM mapping_rules').run();
    return result.changes;
  }

  public getDistinctDevices(): string[] {
    const db = getDb();
    const rows = db.prepare('SELECT DISTINCT device_name FROM mapping_rules ORDER BY device_name').all() as Array<{ device_name: string }>;
    return rows.map(r => r.device_name);
  }

  public getStats(): { totalRules: number; deviceCount: number } {
    const db = getDb();
    const ruleCount = db.prepare('SELECT COUNT(*) as count FROM mapping_rules').get() as { count: number };
    const deviceCount = db.prepare('SELECT COUNT(DISTINCT device_name) as count FROM mapping_rules').get() as { count: number };
    return {
      totalRules: ruleCount.count,
      deviceCount: deviceCount.count,
    };
  }

  private rowToMappingRule(row: any): MappingRule {
    return {
      id: row.id,
      deviceName: row.device_name,
      registerType: row.register_type,
      registerAddress: row.register_address,
      dataType: row.data_type,
      opcuaNodeId: row.opcua_node_id,
      opcuaBrowseName: row.opcua_browse_name,
      description: row.description || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const mappingService = new MappingService();
