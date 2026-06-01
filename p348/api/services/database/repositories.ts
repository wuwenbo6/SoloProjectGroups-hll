import db from '../../database';
import { ChargePoint, Transaction, BillingDetail, PricingRule, DashboardStats } from '../../../shared/types';

export const chargePointRepository = {
  upsert(id: string, data: Omit<ChargePoint, 'id' | 'createdAt' | 'status'> & { status?: ChargePoint['status'] }): void {
    const existing = db.prepare('SELECT id FROM charge_points WHERE id = ?').get(id);
    if (existing) {
      db.prepare(`
        UPDATE charge_points SET
          charge_point_vendor = ?,
          charge_point_model = ?,
          charge_point_serial_number = ?,
          firmware_version = ?,
          status = COALESCE(?, status),
          last_heartbeat = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        data.chargePointVendor,
        data.chargePointModel,
        data.chargePointSerialNumber ?? null,
        data.firmwareVersion ?? null,
        data.status ?? null,
        id
      );
    } else {
      db.prepare(`
        INSERT INTO charge_points (id, charge_point_vendor, charge_point_model, charge_point_serial_number, firmware_version, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.chargePointVendor,
        data.chargePointModel,
        data.chargePointSerialNumber ?? null,
        data.firmwareVersion ?? null,
        data.status ?? 'available'
      );
    }
  },

  updateStatus(id: string, status: ChargePoint['status']): void {
    db.prepare('UPDATE charge_points SET status = ?, last_heartbeat = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  },

  updateHeartbeat(id: string): void {
    db.prepare('UPDATE charge_points SET last_heartbeat = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  },

  findAll(): ChargePoint[] {
    const rows = db.prepare('SELECT * FROM charge_points ORDER BY created_at DESC').all() as any[];
    return rows.map(row => mapChargePoint(row));
  },

  findById(id: string): ChargePoint | undefined {
    const row = db.prepare('SELECT * FROM charge_points WHERE id = ?').get(id) as any;
    return row ? mapChargePoint(row) : undefined;
  },

  count(): { total: number; online: number } {
    const result = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status != 'offline' THEN 1 ELSE 0 END) as online
      FROM charge_points
    `).get() as { total: number; online: number };
    return { total: result.total, online: result.online ?? 0 };
  }
};

export const transactionRepository = {
  create(data: Omit<Transaction, 'id' | 'status'>): number {
    const result = db.prepare(`
      INSERT INTO transactions (charge_point_id, connector_id, id_tag, start_time, start_meter_value)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.chargePointId,
      data.connectorId,
      data.idTag,
      data.startTime.toISOString(),
      data.startMeterValue
    );
    return Number(result.lastInsertRowid);
  },

  complete(id: number, data: { stopTime: Date; stopMeterValue: number; energyConsumed: number; duration: number }): void {
    db.prepare(`
      UPDATE transactions SET
        stop_time = ?,
        stop_meter_value = ?,
        energy_consumed = ?,
        duration = ?,
        status = 'completed'
      WHERE id = ?
    `).run(
      data.stopTime.toISOString(),
      data.stopMeterValue,
      data.energyConsumed,
      data.duration,
      id
    );
  },

  findAll(options?: { limit?: number; offset?: number; status?: Transaction['status'] }): Transaction[] {
    let query = 'SELECT * FROM transactions';
    const params: any[] = [];

    if (options?.status) {
      query += ' WHERE status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY start_time DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(row => mapTransaction(row));
  },

  findById(id: number): (Transaction & { billing?: BillingDetail }) | undefined {
    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as any;
    if (!row) return undefined;

    const transaction = mapTransaction(row);
    const billingRow = db.prepare('SELECT * FROM billing_details WHERE transaction_id = ?').get(id) as any;
    if (billingRow) {
      return { ...transaction, billing: mapBillingDetail(billingRow) };
    }
    return transaction;
  },

  countActive(): number {
    const result = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE status = 'active'").get() as { count: number };
    return result.count;
  },

  getTodayStats(): { energy: number; revenue: number } {
    const result = db.prepare(`
      SELECT
        COALESCE(SUM(t.energy_consumed), 0) as energy,
        COALESCE(SUM(b.total_cost), 0) as revenue
      FROM transactions t
      LEFT JOIN billing_details b ON t.id = b.transaction_id
      WHERE DATE(t.start_time) = DATE('now')
        AND t.status = 'completed'
    `).get() as { energy: number; revenue: number };
    return { energy: result.energy ?? 0, revenue: result.revenue ?? 0 };
  }
};

export const billingRepository = {
  create(data: Omit<BillingDetail, 'id' | 'createdAt'>): number {
    const result = db.prepare(`
      INSERT INTO billing_details (transaction_id, energy_consumed, duration_minutes, energy_price, service_price, energy_cost, service_cost, total_cost, pricing_rule_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.transactionId,
      data.energyConsumed,
      data.durationMinutes,
      data.energyPrice,
      data.servicePrice,
      data.energyCost,
      data.serviceCost,
      data.totalCost,
      data.pricingRuleId ?? null
    );
    return Number(result.lastInsertRowid);
  },

  findAll(options?: { limit?: number; offset?: number }): (BillingDetail & { transaction?: Transaction })[] {
    let query = `
      SELECT b.*, t.charge_point_id, t.connector_id, t.id_tag, t.start_time, t.stop_time
      FROM billing_details b
      LEFT JOIN transactions t ON b.transaction_id = t.id
      ORDER BY b.created_at DESC
    `;
    const params: any[] = [];

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(row => ({
      ...mapBillingDetail(row),
      transaction: {
        id: row.transaction_id,
        chargePointId: row.charge_point_id,
        connectorId: row.connector_id,
        idTag: row.id_tag,
        startTime: new Date(row.start_time),
        stopTime: row.stop_time ? new Date(row.stop_time) : undefined,
        startMeterValue: 0,
        status: 'completed'
      } as Transaction
    }));
  },

  findByTransactionId(transactionId: number): BillingDetail | undefined {
    const row = db.prepare('SELECT * FROM billing_details WHERE transaction_id = ?').get(transactionId) as any;
    return row ? mapBillingDetail(row) : undefined;
  }
};

export const pricingRepository = {
  findActive(): PricingRule[] {
    const rows = db.prepare('SELECT * FROM pricing_rules WHERE is_active = 1 ORDER BY start_time').all() as any[];
    return rows.map(row => mapPricingRule(row));
  },

  findAll(): PricingRule[] {
    const rows = db.prepare('SELECT * FROM pricing_rules ORDER BY start_time').all() as any[];
    return rows.map(row => mapPricingRule(row));
  }
};

export function getDashboardStats(): DashboardStats {
  const cpCount = chargePointRepository.count();
  const activeTx = transactionRepository.countActive();
  const todayStats = transactionRepository.getTodayStats();

  return {
    onlineChargePoints: cpCount.online,
    totalChargePoints: cpCount.total,
    activeTransactions: activeTx,
    todayEnergy: todayStats.energy,
    todayRevenue: todayStats.revenue
  };
}

function mapChargePoint(row: any): ChargePoint {
  return {
    id: row.id,
    chargePointVendor: row.charge_point_vendor,
    chargePointModel: row.charge_point_model,
    chargePointSerialNumber: row.charge_point_serial_number ?? undefined,
    firmwareVersion: row.firmware_version ?? undefined,
    status: row.status as ChargePoint['status'],
    lastHeartbeat: row.last_heartbeat ? new Date(row.last_heartbeat) : undefined,
    createdAt: new Date(row.created_at)
  };
}

function mapTransaction(row: any): Transaction {
  return {
    id: row.id,
    chargePointId: row.charge_point_id,
    connectorId: row.connector_id,
    idTag: row.id_tag,
    startTime: new Date(row.start_time),
    stopTime: row.stop_time ? new Date(row.stop_time) : undefined,
    startMeterValue: row.start_meter_value,
    stopMeterValue: row.stop_meter_value ?? undefined,
    energyConsumed: row.energy_consumed ?? undefined,
    duration: row.duration ?? undefined,
    status: row.status as Transaction['status']
  };
}

function mapBillingDetail(row: any): BillingDetail {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    energyConsumed: row.energy_consumed,
    durationMinutes: row.duration_minutes,
    energyPrice: row.energy_price,
    servicePrice: row.service_price,
    energyCost: row.energy_cost,
    serviceCost: row.service_cost,
    totalCost: row.total_cost,
    pricingRuleId: row.pricing_rule_id ?? undefined,
    createdAt: new Date(row.created_at)
  };
}

function mapPricingRule(row: any): PricingRule {
  return {
    id: row.id,
    name: row.name,
    startTime: row.start_time,
    endTime: row.end_time,
    energyRate: row.energy_rate,
    serviceRate: row.service_rate,
    isActive: row.is_active === 1
  };
}
