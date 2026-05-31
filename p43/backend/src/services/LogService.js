const { ControlLog, sequelize } = require('../models');
const { Op } = require('sequelize');

class LogService {
  constructor() {
    this.pendingLogs = [];
    this.batchTimer = null;
    this.batchInterval = 5000;
  }

  async logControl(options) {
    const {
      deviceId,
      deviceName,
      action,
      actionSource,
      brightness,
      colorTemperature,
      area,
      affectedDevices,
      energyConsumption = 0
    } = options;

    const logEntry = {
      deviceId,
      deviceName,
      action,
      actionSource,
      brightness,
      colorTemperature,
      area,
      affectedDevices,
      energyConsumption,
      timestamp: new Date()
    };

    this.pendingLogs.push(logEntry);

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.batchInterval);
    }

    if (this.pendingLogs.length >= 50) {
      this.flushBatch();
    }
  }

  async flushBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingLogs.length === 0) {
      return;
    }

    const logs = [...this.pendingLogs];
    this.pendingLogs = [];

    try {
      await ControlLog.bulkCreate(logs);
    } catch (error) {
      console.error('Failed to batch insert logs:', error.message);
    }
  }

  async getLogs(options = {}) {
    const {
      startTime,
      endTime,
      action,
      deviceId,
      area,
      page = 1,
      pageSize = 100
    } = options;

    const where = {};

    if (startTime) {
      where.timestamp = { ...where.timestamp, [Op.gte]: new Date(startTime) };
    }
    if (endTime) {
      where.timestamp = { ...where.timestamp, [Op.lte]: new Date(endTime) };
    }
    if (action) {
      where.action = action;
    }
    if (deviceId) {
      where.deviceId = deviceId;
    }
    if (area) {
      where.area = area;
    }

    const { count, rows } = await ControlLog.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    return {
      total: count,
      page,
      pageSize,
      data: rows
    };
  }

  async exportLogs(options = {}) {
    const { startTime, endTime, action, deviceId, area, format = 'csv' } = options;

    const where = {};

    if (startTime) {
      where.timestamp = { ...where.timestamp, [Op.gte]: new Date(startTime) };
    }
    if (endTime) {
      where.timestamp = { ...where.timestamp, [Op.lte]: new Date(endTime) };
    }
    if (action) {
      where.action = action;
    }
    if (deviceId) {
      where.deviceId = deviceId;
    }
    if (area) {
      where.area = area;
    }

    const logs = await ControlLog.findAll({
      where,
      order: [['timestamp', 'ASC']]
    });

    if (format === 'csv') {
      return this.formatCSV(logs);
    } else if (format === 'json') {
      return JSON.stringify(logs.map(log => log.toJSON()), null, 2);
    }

    return logs;
  }

  formatCSV(logs) {
    const headers = ['ID', '设备ID', '设备名称', '操作类型', '操作来源', '亮度', '色温', '区域', '影响设备数', '能耗(Wh)', '时间'];
    
    const rows = logs.map(log => [
      log.id,
      log.deviceId || '',
      log.deviceName || '',
      log.action,
      log.actionSource || '',
      log.brightness || '',
      log.colorTemperature || '',
      log.area || '',
      log.affectedDevices || '',
      log.energyConsumption || 0,
      log.timestamp.toISOString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }

  async getActionStats(startTime, endTime) {
    const stats = await ControlLog.findAll({
      where: {
        timestamp: {
          [Op.gte]: new Date(startTime),
          [Op.lte]: new Date(endTime)
        }
      },
      attributes: [
        'action',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('energyConsumption')), 'totalEnergy']
      ],
      group: ['action']
    });

    return stats;
  }
}

module.exports = new LogService();
