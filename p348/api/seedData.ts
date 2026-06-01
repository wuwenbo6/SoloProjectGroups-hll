import db from './database';
import { billingService } from './services/billing/BillingService';

export function seedMockData(): void {
  const cpCount = db.prepare('SELECT COUNT(*) as count FROM charge_points').get() as { count: number };

  if (cpCount.count > 0) {
    console.log('[Seed] Data already exists, skipping seed');
    return;
  }

  console.log('[Seed] Inserting mock data...');

  const insertCP = db.prepare(`
    INSERT INTO charge_points (id, charge_point_vendor, charge_point_model, charge_point_serial_number, firmware_version, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertCP.run('CP001', 'ABB', 'Tera DC', 'SN-2024-0001', 'v1.2.3', 'available');
  insertCP.run('CP002', 'Siemens', 'VersiCharge', 'SN-2024-0002', 'v1.1.0', 'available');
  insertCP.run('CP003', 'Wallbox', 'Pulsar Plus', 'SN-2024-0003', 'v2.0.1', 'charging');
  insertCP.run('CP004', 'Tesla', 'Wall Connector', 'SN-2024-0004', 'v3.5.2', 'offline');
  insertCP.run('CP005', 'EVBox', 'BusinessLine', 'SN-2024-0005', 'v1.8.0', 'available');

  const insertTx = db.prepare(`
    INSERT INTO transactions (charge_point_id, connector_id, id_tag, start_time, start_meter_value, stop_time, stop_meter_value, energy_consumed, duration, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const tx1Id = Number(insertTx.run(
    'CP001', 1, 'RFID-001',
    twoHoursAgo.toISOString(), 50000,
    oneHourAgo.toISOString(), 52500,
    2500, 3600, 'completed'
  ).lastInsertRowid);

  const tx2Id = Number(insertTx.run(
    'CP002', 1, 'RFID-002',
    threeHoursAgo.toISOString(), 75000,
    oneHourAgo.toISOString(), 79000,
    4000, 7200, 'completed'
  ).lastInsertRowid);

  const tx3Id = Number(insertTx.run(
    'CP005', 1, 'RFID-003',
    yesterday.toISOString(), 100000,
    new Date(yesterday.getTime() + 90 * 60 * 1000).toISOString(), 104500,
    4500, 5400, 'completed'
  ).lastInsertRowid);

  insertTx.run(
    'CP003', 1, 'RFID-004',
    oneHourAgo.toISOString(), 30000,
    null, null,
    null, null, 'active'
  );

  billingService.completeTransactionAndBilling(tx1Id, oneHourAgo, 52500);
  billingService.completeTransactionAndBilling(tx2Id, oneHourAgo, 79000);
  billingService.completeTransactionAndBilling(tx3Id, new Date(yesterday.getTime() + 90 * 60 * 1000), 104500);

  console.log('[Seed] Mock data inserted successfully');
}
