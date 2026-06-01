import db from '../models/database.js';
import type { OperationLog } from '../../../shared/types.js';

class LogService {
  private insertLogStmt: any;
  private getLogsStmt: any;
  private countLogsStmt: any;

  constructor() {
    this.initStatements();
  }

  private initStatements() {
    this.insertLogStmt = db.prepare(`
      INSERT INTO operation_logs (user, action, resource, resource_id, status, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.getLogsStmt = db.prepare(`
      SELECT id, timestamp, user, action, resource, resource_id as resourceId, status, message
      FROM operation_logs
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    this.countLogsStmt = db.prepare(`
      SELECT COUNT(*) as total FROM operation_logs
    `);
  }

  async log(
    user: string,
    action: string,
    resource: string,
    resourceId: string,
    status: 'success' | 'failed',
    message: string = ''
  ): Promise<void> {
    this.insertLogStmt.run(user, action, resource, resourceId, status, message);
  }

  async getLogs(limit: number = 50, offset: number = 0): Promise<{ logs: OperationLog[], total: number }> {
    const logs = this.getLogsStmt.all(limit, offset) as OperationLog[];
    const { total } = this.countLogsStmt.get() as { total: number };
    return { logs, total };
  }

  async getAllLogs(): Promise<OperationLog[]> {
    const stmt = db.prepare(`
      SELECT id, timestamp, user, action, resource, resource_id as resourceId, status, message
      FROM operation_logs
      ORDER BY timestamp DESC
    `);
    return stmt.all() as OperationLog[];
  }

  exportToCSV(logs: OperationLog[]): string {
    const headers = ['ID', '时间', '用户', '操作', '资源类型', '资源ID', '状态', '消息'];
    const rows = logs.map(log => [
      log.id,
      log.timestamp,
      log.user,
      log.action,
      log.resource,
      log.resourceId,
      log.status,
      `"${log.message.replace(/"/g, '""')}"`
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  exportToJSON(logs: OperationLog[]): string {
    return JSON.stringify(logs, null, 2);
  }
}

export const logService = new LogService();
