const { AutomationRule, Sensor, Device } = require('../models');

class AutomationEngine {
  constructor(mqttClient, gateway) {
    this.mqttClient = mqttClient;
    this.gateway = gateway;
    this.sensorStates = new Map();
    this.ruleCooldowns = new Map();
  }

  start() {
    this.setupSensorSubscriptions();
    console.log('Automation Engine started');
  }

  setupSensorSubscriptions() {
    if (this.mqttClient) {
      this.mqttClient.subscribe('sensors/data/#');
      
      this.mqttClient.on('message', async (topic, message) => {
        if (topic.startsWith('sensors/data/')) {
          try {
            const data = JSON.parse(message.toString());
            await this.processSensorData(data);
          } catch (e) {
            console.error('Failed to parse sensor data:', e.message);
          }
        }
      });
    }
  }

  async processSensorData(sensorData) {
    const { sensorId, value, timestamp } = sensorData;
    
    this.sensorStates.set(sensorId, {
      value,
      timestamp: timestamp || new Date().toISOString()
    });

    const rules = await AutomationRule.findAll({
      where: {
        enabled: true,
        triggerType: 'sensor'
      }
    });

    for (const rule of rules) {
      await this.evaluateRule(rule, sensorId, value);
    }
  }

  async evaluateRule(rule, sensorId, value) {
    const condition = rule.triggerCondition;
    
    if (condition.sensorId !== sensorId) {
      return;
    }

    const now = Date.now();
    const cooldownKey = `rule-${rule.id}`;
    const lastTriggered = this.ruleCooldowns.get(cooldownKey) || 0;
    const cooldownPeriod = 60000;

    if (now - lastTriggered < cooldownPeriod) {
      return;
    }

    const triggered = this.evaluateCondition(condition, value);
    
    if (triggered) {
      console.log(`Rule "${rule.name}" triggered by sensor ${sensorId} = ${value}`);
      await this.executeRule(rule);
      this.ruleCooldowns.set(cooldownKey, now);
      
      await rule.update({
        lastTriggered: new Date(),
        triggerCount: rule.triggerCount + 1
      });
    }
  }

  evaluateCondition(condition, value) {
    const { operator, value: threshold } = condition;
    
    switch (operator) {
      case 'equals':
        return value === threshold;
      case 'not_equals':
        return value !== threshold;
      case 'greater_than':
        return value > threshold;
      case 'less_than':
        return value < threshold;
      case 'greater_than_or_equals':
        return value >= threshold;
      case 'less_than_or_equals':
        return value <= threshold;
      default:
        return false;
    }
  }

  async executeRule(rule) {
    const action = rule.action;
    
    try {
      switch (action.type) {
        case 'scene':
          await this.applyScene(action);
          break;
        case 'brightness':
          await this.setBrightness(action);
          break;
        case 'colorTemperature':
          await this.setColorTemperature(action);
          break;
        case 'custom':
          await this.executeCustomAction(action);
          break;
        default:
          console.log(`Unknown action type: ${action.type}`);
      }
    } catch (error) {
      console.error(`Failed to execute rule ${rule.name}:`, error);
    }
  }

  async applyScene(action) {
    if (this.gateway) {
      this.gateway.applyScene(action.sceneId, action.deviceIds);
    }
    
    if (this.mqttClient) {
      this.mqttClient.publish('blemesh/command/set-scene', JSON.stringify({
        sceneId: action.sceneId,
        deviceIds: action.deviceIds,
        areas: action.targetAreas
      }));
    }

    const { Scene, Device } = require('../models');
    const scene = await Scene.findByPk(action.sceneId);
    if (scene) {
      const whereClause = {};
      if (action.targetAreas && action.targetAreas.length > 0) {
        whereClause.area = action.targetAreas;
      }
      await Device.update(
        {
          brightness: scene.brightness,
          colorTemperature: scene.colorTemperature,
          lastUpdate: new Date()
        },
        { where: whereClause }
      );
    }
  }

  async setBrightness(action) {
    const controlData = { brightness: action.brightness };
    
    if (action.targetAreas && action.targetAreas.length > 0) {
      const devices = await Device.findAll({
        where: { area: action.targetAreas }
      });
      
      devices.forEach(device => {
        if (this.gateway) {
          this.gateway.updateDevice(device.id, controlData);
        }
        if (this.mqttClient) {
          this.mqttClient.publish(`blemesh/control/${device.id}`, JSON.stringify(controlData));
        }
        device.update({ ...controlData, lastUpdate: new Date() });
      });
    } else if (this.gateway) {
      this.gateway.controlAllDevices(controlData);
      if (this.mqttClient) {
        this.mqttClient.publish('blemesh/control/all', JSON.stringify(controlData));
      }
    }
  }

  async setColorTemperature(action) {
    const controlData = { colorTemperature: action.colorTemperature };
    
    if (action.targetAreas && action.targetAreas.length > 0) {
      const devices = await Device.findAll({
        where: { area: action.targetAreas }
      });
      
      devices.forEach(device => {
        if (this.gateway) {
          this.gateway.updateDevice(device.id, controlData);
        }
        if (this.mqttClient) {
          this.mqttClient.publish(`blemesh/control/${device.id}`, JSON.stringify(controlData));
        }
        device.update({ ...controlData, lastUpdate: new Date() });
      });
    } else if (this.gateway) {
      this.gateway.controlAllDevices(controlData);
      if (this.mqttClient) {
        this.mqttClient.publish('blemesh/control/all', JSON.stringify(controlData));
      }
    }
  }

  async executeCustomAction(action) {
    console.log('Executing custom action:', action);
  }

  stop() {
    this.sensorStates.clear();
    this.ruleCooldowns.clear();
    console.log('Automation Engine stopped');
  }
}

module.exports = AutomationEngine;
