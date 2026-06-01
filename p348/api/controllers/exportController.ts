import { Request, Response } from 'express';
import { transactionRepository, billingRepository } from '../services/database/repositories';

function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export async function exportTransactionsCSV(req: Request, res: Response): Promise<void> {
  try {
    const { status, chargePointId, startDate, endDate } = req.query;

    let transactions = transactionRepository.findAll(1000, 0);

    if (typeof status === 'string' && status) {
      transactions = transactions.filter(t => t.status === status);
    }
    if (typeof chargePointId === 'string' && chargePointId) {
      transactions = transactions.filter(t => t.chargePointId === chargePointId);
    }
    if (typeof startDate === 'string' && startDate) {
      const start = new Date(startDate);
      transactions = transactions.filter(t => new Date(t.startTime) >= start);
    }
    if (typeof endDate === 'string' && endDate) {
      const end = new Date(endDate);
      transactions = transactions.filter(t => new Date(t.startTime) <= end);
    }

    const billingMap = new Map<number, any>();
    for (const tx of transactions) {
      if (tx.id) {
        const billing = billingRepository.findByTransactionId(tx.id);
        if (billing) {
          billingMap.set(tx.id, billing);
        }
      }
    }

    const headers = [
      '交易ID',
      '充电桩ID',
      '充电枪号',
      '用户标签',
      '开始时间',
      '结束时间',
      '起始电量(kWh)',
      '结束电量(kWh)',
      '充电量(kWh)',
      '充电时长(秒)',
      '状态',
      '电费(元)',
      '服务费(元)',
      '总费用(元)',
      '电价(元/kWh)',
      '服务费率(元/kWh)'
    ];

    const rows = transactions.map(tx => {
      const billing = tx.id ? billingMap.get(tx.id) : null;
      return [
        tx.id ?? '',
        tx.chargePointId,
        tx.connectorId ?? '',
        tx.idTag,
        formatDateTime(tx.startTime),
        tx.stopTime ? formatDateTime(tx.stopTime) : '',
        tx.startMeterValue ? (tx.startMeterValue / 1000).toFixed(2) : '',
        tx.stopMeterValue ? (tx.stopMeterValue / 1000).toFixed(2) : '',
        tx.energyConsumed ? (tx.energyConsumed / 1000).toFixed(2) : '',
        tx.duration ?? '',
        tx.status,
        billing ? billing.energyCost.toFixed(2) : '',
        billing ? billing.serviceCost.toFixed(2) : '',
        billing ? billing.totalCost.toFixed(2) : '',
        billing ? billing.energyPrice.toFixed(3) : '',
        billing ? billing.servicePrice.toFixed(3) : ''
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const filename = `transactions_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    res.write('\uFEFF');
    res.write(csvContent);
    res.end();
  } catch (error) {
    console.error('[API] Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
}
