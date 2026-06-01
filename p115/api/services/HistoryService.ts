import { getDb } from '../data/database';
import { NodeHistory, HistoryQuery } from '../../shared/types';

class HistoryService {
  public recordHistory(nodeId: string, browseName: string, value: any, quality: string = 'Good'): void {
    const db = getDb();
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    
    db.prepare(`
      INSERT INTO node_history (node_id, browse_name, value, quality, source_timestamp)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(nodeId, browseName, valueStr, quality);
  }

  public recordHistoryBatch(records: Array<{ nodeId: string; browseName: string; value: any; quality?: string }>): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO node_history (node_id, browse_name, value, quality, source_timestamp)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    
    const tx = db.transaction((recs: typeof records) => {
      for (const rec of recs) {
        const valueStr = typeof rec.value === 'object' ? JSON.stringify(rec.value) : String(rec.value);
        stmt.run(rec.nodeId, rec.browseName, valueStr, rec.quality || 'Good');
      }
    });
    
    tx(records);
  }

  public queryHistory(query: HistoryQuery): NodeHistory[] {
    const db = getDb();
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (query.nodeId) {
      conditions.push('node_id = ?');
      params.push(query.nodeId);
    }
    
    if (query.startTime) {
      conditions.push('source_timestamp >= ?');
      params.push(query.startTime);
    }
    
    if (query.endTime) {
      conditions.push('source_timestamp <= ?');
      params.push(query.endTime);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = query.limit ? `LIMIT ${query.limit}` : 'LIMIT 1000';
    
    const sql = `
      SELECT id, node_id, browse_name, value, quality, source_timestamp, created_at
      FROM node_history
      ${whereClause}
      ORDER BY source_timestamp DESC
      ${limit}
    `;
    
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(this.rowToHistory);
  }

  public getLatestValue(nodeId: string): NodeHistory | null {
    const db = getDb();
    const row = db.prepare(`
      SELECT id, node_id, browse_name, value, quality, source_timestamp, created_at
      FROM node_history
      WHERE node_id = ?
      ORDER BY source_timestamp DESC
      LIMIT 1
    `).get(nodeId) as any;
    
    return row ? this.rowToHistory(row) : null;
  }

  public getStats(nodeId?: string): { totalRecords: number; firstRecord: string | null; lastRecord: string | null } {
    const db = getDb();
    let sql = 'SELECT COUNT(*) as count FROM node_history';
    const params: any[] = [];
    
    if (nodeId) {
      sql += ' WHERE node_id = ?';
      params.push(nodeId);
    }
    
    const result = db.prepare(sql).get(...params) as { count: number };
    
    let firstRecord: string | null = null;
    let lastRecord: string | null = null;
    
    if (result.count > 0) {
      const minMaxSql = nodeId 
        ? 'SELECT MIN(source_timestamp) as min_ts, MAX(source_timestamp) as max_ts FROM node_history WHERE node_id = ?'
        : 'SELECT MIN(source_timestamp) as min_ts, MAX(source_timestamp) as max_ts FROM node_history';
      
      const minMaxParams = nodeId ? [nodeId] : [];
      const minMax = db.prepare(minMaxSql).get(...minMaxParams) as { min_ts: string; max_ts: string };
      
      firstRecord = minMax.min_ts;
      lastRecord = minMax.max_ts;
    }
    
    return {
      totalRecords: result.count,
      firstRecord,
      lastRecord,
    };
  }

  public cleanupOldRecords(daysToKeep: number = 30): number {
    const db = getDb();
    const result = db.prepare(`
      DELETE FROM node_history
      WHERE source_timestamp < datetime('now', ?)
    `).run(`-${daysToKeep} days`);
    
    return result.changes;
  }

  public deleteByNodeId(nodeId: string): number {
    const db = getDb();
    const result = db.prepare('DELETE FROM node_history WHERE node_id = ?').run(nodeId);
    return result.changes;
  }

  public deleteAll(): number {
    const db = getDb();
    const result = db.prepare('DELETE FROM node_history').run();
    return result.changes;
  }

  private rowToHistory(row: any): NodeHistory {
    return {
      id: row.id,
      nodeId: row.node_id,
      browseName: row.browse_name,
      value: row.value,
      quality: row.quality,
      sourceTimestamp: row.source_timestamp,
      createdAt: row.created_at,
    };
  }
}

export const historyService = new HistoryService();
