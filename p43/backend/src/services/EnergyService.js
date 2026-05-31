const { EnergyStats, Device, sequelize } = require('../models');
const { Op, fn, col } = require('sequelize');
const logService = require('./LogService');

const POWER_PER_DEVICE = 0.05;
const ELECTRICITY_RATE = 0.8;

class EnergyService {
  constructor() {
    this.deviceStates = new Map();
    this.hourlyTimer = null;
  }

  start(devices) {
    devices.forEach(device => {
      this.deviceStates.set(device.id, {
        brightness: device.brightness,
        online: device.online,
        area: device.area,
        lastUpdate: Date.now()
      });
    });

    this.hourlyTimer = setInterval(() => {
      this.calculateHourlyStats();
    }, 60 * 60 * 1000);

    console.log('Energy Service started');
  }

  updateDeviceState(deviceId, brightness, online, area) {
    const previousState = this.deviceStates.get(deviceId) || { brightness: 0, online: false };
    
    this.deviceStates.set(deviceId, {
      brightness,
      online,
      area,
      lastUpdate: Date.now(),
      previousBrightness: previousState.brightness,
      previousOnline: previousState.online
    });
  }

  calculateDeviceEnergy(deviceId, durationMinutes = 60) {
    const state = this.deviceStates.get(deviceId);
    if (!state || !state.online) {
      return 0;
    }

    const brightnessFactor = state.brightness / 100;
    const energy = POWER_PER_DEVICE * brightnessFactor * (durationMinutes / 60);
    
    return energy;
  }

  async calculateHourlyStats() {
    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);

    const areas = new Set(['all', ...Array.from(this.deviceStates.values()).map(s => s.area).filter(Boolean)]);

    for (const area of areas) {
      let totalKwh = 0;
      let peakKwh = 0;
      let totalBrightness = 0;
      let activeDevices = 0;
      let runtimeMinutes = 0;

      const devicesInArea = area === 'all' 
        ? Array.from(this.deviceStates.entries())
        : Array.from(this.deviceStates.entries()).filter(([_, s]) => s.area === area);

      for (const [deviceId, state] of devicesInArea) {
        if (state.online) {
          const energy = this.calculateDeviceEnergy(deviceId, 60);
          totalKwh += energy;
          peakKwh = Math.max(peakKwh, energy);
          totalBrightness += state.brightness;
          activeDevices++;
          runtimeMinutes += 60;
        }
      }

      const avgBrightness = activeDevices > 0 ? totalBrightness / activeDevices : 0;
      const estimatedCost = totalKwh * ELECTRICITY_RATE;

      try {
        await EnergyStats.create({
          period: 'hourly',
          timestamp: hourStart,
          area: area === 'all' ? null : area,
          totalKwh: Math.round(totalKwh * 1000) / 1000,
          peakKwh: Math.round(peakKwh * 1000) / 1000,
          averageBrightness: Math.round(avgBrightness * 10) / 10,
          deviceCount: activeDevices,
          runtimeMinutes,
          estimatedCost: Math.round(estimatedCost * 100) / 100,
          daylightSavings: 0
        });
      } catch (error) {
        console.error('Failed to create energy stats:', error.message);
      }
    }
  }

  async getStats(period, startTime, endTime, area = null) {
    const where = {
      period,
      timestamp: {
        [Op.gte]: new Date(startTime),
        [Op.lte]: new Date(endTime)
      }
    };

    if (area) {
      where.area = area;
    }

    const stats = await EnergyStats.findAll({
      where,
      order: [['timestamp', 'ASC']]
    });

    return stats;
  }

  async getSummary(startTime, endTime, area = null) {
    const where = {
      timestamp: {
        [Op.gte]: new Date(startTime),
        [Op.lte]: new Date(endTime)
      }
    };

    if (area) {
      where.area = area;
    }

    const summary = await EnergyStats.findOne({
      where,
      attributes: [
        [fn('SUM', col('totalKwh')), 'totalKwh'],
        [fn('MAX', col('peakKwh')), 'peakKwh'],
        [fn('AVG', col('averageBrightness')), 'avgBrightness'],
        [fn('SUM', col('runtimeMinutes')), 'totalRuntime'],
        [fn('SUM', col('estimatedCost')), 'totalCost'],
        [fn('SUM', col('daylightSavings')), 'totalSavings']
      ],
      raw: true
    });

    return {
      totalKwh: summary.totalKwh || 0,
      peakKwh: summary.peakKwh || 0,
      avgBrightness: summary.avgBrightness || 0,
      totalRuntime: summary.totalRuntime || 0,
      totalCost: summary.estimatedCost || 0,
      totalSavings: summary.totalSavings || 0,
      co2Saved: (summary.totalKwh || 0) * 0.5
    };
  }

  async getComparison(period, area = null) {
    const now = new Date();
    let currentStart, previousStart, previousEnd;

    switch (period) {
      case 'daily':
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        previousStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        previousEnd = currentStart;
        break;
      case 'weekly':
        const dayOfWeek = now.getDay();
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        previousStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - 7);
        previousEnd = currentStart;
        break;
      case 'monthly':
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEnd = currentStart;
        break;
      default:
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        previousStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        previousEnd = currentStart;
    }

    const [current, previous] = await Promise.all([
      this.getSummary(currentStart, now, area),
      this.getSummary(previousStart, previousEnd, area)
    ]);

    return { current, previous };
  }

  async recordDaylightSavings(area, savedKwh, timestamp = new Date()) {
    const hourStart = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate(), timestamp.getHours(), 0, 0);

    try {
      const [stat, created] = await EnergyStats.findOrCreate({
        where: {
          period: 'hourly',
          timestamp: hourStart,
          area: area || null
        },
        defaults: {
          totalKwh: 0,
          peakKwh: 0,
          averageBrightness: 0,
          deviceCount: 0,
          runtimeMinutes: 0,
          estimatedCost: 0,
          daylightSavings: savedKwh
        }
      });

      if (!created) {
        stat.daylightSavings += savedKwh;
        await stat.save();
      }
    } catch (error) {
      console.error('Failed to record daylight savings:', error.message);
    }
  }

  stop() {
    if (this.hourlyTimer) {
      clearInterval(this.hourlyTimer);
      this.hourlyTimer = null;
    }
    logService.flushBatch();
  }
}

module.exports = new EnergyService();
