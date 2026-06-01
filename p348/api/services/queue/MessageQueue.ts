import db from '../../database';

export interface QueuedMessage {
  id: number;
  chargePointId: string;
  action: string;
  payload: string;
  createdAt: Date;
  retryCount: number;
  lastRetryAt?: Date;
  status: 'pending' | 'delivered' | 'failed';
}

export class MessageQueue {
  init(): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        charge_point_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_retry_at DATETIME,
        status TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE INDEX IF NOT EXISTS idx_mq_charge_point ON message_queue(charge_point_id);
      CREATE INDEX IF NOT EXISTS idx_mq_status ON message_queue(status);
    `);
    console.log('[MessageQueue] Initialized');
  }

  enqueue(chargePointId: string, action: string, payload: Record<string, unknown>): number {
    const result = db.prepare(`
      INSERT INTO message_queue (charge_point_id, action, payload)
      VALUES (?, ?, ?)
    `).run(chargePointId, action, JSON.stringify(payload));

    console.log(`[MessageQueue] Enqueued ${action} for ${chargePointId} (id=${Number(result.lastInsertRowid)})`);
    return Number(result.lastInsertRowid);
  }

  getPendingForChargePoint(chargePointId: string): QueuedMessage[] {
    const rows = db.prepare(`
      SELECT * FROM message_queue
      WHERE charge_point_id = ? AND status = 'pending'
      ORDER BY created_at ASC
    `).all(chargePointId) as any[];

    return rows.map(row => this.mapRow(row));
  }

  markDelivered(id: number): void {
    db.prepare(`
      UPDATE message_queue SET status = 'delivered', last_retry_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    console.log(`[MessageQueue] Message ${id} delivered`);
  }

  markFailed(id: number): void {
    db.prepare(`
      UPDATE message_queue SET
        retry_count = retry_count + 1,
        last_retry_at = CURRENT_TIMESTAMP,
        status = CASE WHEN retry_count + 1 >= 10 THEN 'failed' ELSE 'pending' END
      WHERE id = ?
    `).run(id);
    console.log(`[MessageQueue] Message ${id} delivery failed, retry_count incremented`);
  }

  markAllDeliveredForChargePoint(chargePointId: string): void {
    const result = db.prepare(`
      UPDATE message_queue SET status = 'delivered', last_retry_at = CURRENT_TIMESTAMP
      WHERE charge_point_id = ? AND status = 'pending'
    `).run(chargePointId);
    console.log(`[MessageQueue] Marked ${result.changes} messages as delivered for ${chargePointId}`);
  }

  getPendingCount(): number {
    const result = db.prepare(`SELECT COUNT(*) as count FROM message_queue WHERE status = 'pending'`).get() as { count: number };
    return result.count;
  }

  getPendingCountForChargePoint(chargePointId: string): number {
    const result = db.prepare(`SELECT COUNT(*) as count FROM message_queue WHERE charge_point_id = ? AND status = 'pending'`).get(chargePointId) as { count: number };
    return result.count;
  }

  getAllPending(): QueuedMessage[] {
    const rows = db.prepare(`
      SELECT * FROM message_queue WHERE status = 'pending' ORDER BY created_at ASC
    `).all() as any[];
    return rows.map(row => this.mapRow(row));
  }

  cleanOldMessages(maxAgeDays: number = 30): void {
    db.prepare(`
      DELETE FROM message_queue
      WHERE status IN ('delivered', 'failed')
        AND created_at < datetime('now', '-' || ? || ' days')
    `).run(maxAgeDays);
  }

  private mapRow(row: any): QueuedMessage {
    return {
      id: row.id,
      chargePointId: row.charge_point_id,
      action: row.action,
      payload: row.payload,
      createdAt: new Date(row.created_at),
      retryCount: row.retry_count,
      lastRetryAt: row.last_retry_at ? new Date(row.last_retry_at) : undefined,
      status: row.status as QueuedMessage['status']
    };
  }
}

export const messageQueue = new MessageQueue();
