const { AutomationRule } = require('../models');
const { Op } = require('sequelize');
const logService = require('./LogService');
const energyService = require('./EnergyService');

class DaylightService {
  constructor() {
    this.rules = [];
    this.lastAdjustments = new Map();
    this.adjustmentInterval = 5 * 60 * 1000;
    this.timer = null;
    this.mqttClient = null;
    this.bleGateway = null;
    this.currentLux = 500;
  }

  start(mqttClient, bleGateway) {
    this.mqttClient = mqttClient;
    this.bleGateway = bleGateway;

    this.loadRules();

    this.timer = setInterval(() => {
      this.evaluateDaylightCompensation();
    }, 60 * 1000);

    mqttClient.subscribe('sensors/data/#');
    mqttClient.on('message', (topic, message) => {
      if (topic.startsWith('sensors/data/light')) {
        try {
          const data = JSON.parse(message.toString());
          this.currentLux = data.value || 500;
        } catch (e) {
          console.error('Failed to parse sensor data:', e.message);
        }
      }
    });

    console.log('Daylight Compensation Service started');
  }

  async loadRules() {
    try {
      this.rules = await AutomationRule.findAll({
        where: {
          triggerType: 'daylight',
          enabled: true
        }
      });
    } catch (error) {
      console.error('Failed to load daylight rules:', error.message);
    }
  }

  async evaluateDaylightCompensation() {
    const now = Date.now();

    for (const rule of this.rules) {
      const lastAdjustment = this.lastAdjustments.get(rule.id) || 0;
      
      if (now - lastAdjustment < this.adjustmentInterval) {
        continue;
      }

      try {
        await this.applyDaylightRule(rule);
        this.lastAdjustments.set(rule.id, now);
      } catch (error) {
        console.error('Failed to apply daylight rule:', error.message);
      }
    }
  }

  async applyDaylightRule(rule) {
    const { triggerCondition, action } = rule;
    const { sensorId, targetLux, minBrightness, maxBrightness } = triggerCondition;
    const { targetAreas } = action;

    const currentLux = this.simulateDaylightSensorValue();
    const calculatedBrightness = this.calculateCompensatedBrightness(
      currentLux,
      targetLux,
      minBrightness,
      maxBrightness
    );

    const devices = this.bleGateway.getDevices();
    const affectedDevices = devices.filter(d => 
      targetAreas.includes(d.area) && d.online
    );

    if (affectedDevices.length === 0) {
      return;
    }

    const currentAvgBrightness = affectedDevices.reduce((sum, d) => sum + d.brightness, 0) / affectedDevices.length;
    
    const brightnessDiff = Math.abs(calculatedBrightness - currentAvgBrightness);
    if (brightnessDiff < 5) {
      return;
    }

    console.log(`Daylight compensation: Lux=${currentLux}, Target=${targetLux}, Brightness=${calculatedBrightness}%, Affected=${affectedDevices.length}`);

    affectedDevices.forEach(device => {
      this.bleGateway.enqueueCommand(device.id, { brightness: calculatedBrightness });
      energyService.updateDeviceState(device.id, calculatedBrightness, device.online, device.area);
    });

    const baselineEnergy = this.calculateBaselineEnergy(affectedDevices, maxBrightness);
    const actualEnergy = this.calculateBaselineEnergy(affectedDevices, calculatedBrightness);
    const savedEnergy = baselineEnergy - actualEnergy;

    targetAreas.forEach(area => {
      energyService.recordDaylightSavings(area, savedEnergy / targetAreas.length);
    });

    logService.logControl({
      action: 'daylight',
      actionSource: rule.name,
      brightness: calculatedBrightness,
      area: targetAreas.join(','),
      affectedDevices: affectedDevices.length,
      energyConsumption: -savedEnergy
    });
  }

  calculateCompensatedBrightness(currentLux, targetLux, minBrightness, maxBrightness) {
    const luxRatio = Math.min(currentLux / targetLux, 1);
    const compensated = maxBrightness * (1 - luxRatio * 0.7);
    
    return Math.round(Math.max(minBrightness, Math.min(maxBrightness, compensated)));
  }

  simulateDaylightSensorValue() {
    const hour = new Date().getHours();
    
    if (hour < 6 || hour > 20) {
      return 50 + Math.random() * 50;
    } else if (hour >= 6 && hour < 9) {
      const progress = (hour - 6) / 3;
      return 100 + progress * 800 + Math.random() * 100;
    } else if (hour >= 9 && hour < 17) {
      return 600 + Math.random() * 400;
    } else {
      const progress = (20 - hour) / 3;
      return 100 + progress * 700 + Math.random() * 100;
    }
  }

  calculateBaselineEnergy(devices, brightness) {
    const POWER_PER_DEVICE = 0.05;
    const durationHours = 1 / 60;
    
    return devices.length * POWER_PER_DEVICE * (brightness / 100) * durationHours;
  }

  async refreshRules() {
    await this.loadRules();
  }

  getCurrentLux() {
    return this.currentLux;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = new DaylightService();
