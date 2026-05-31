const cron = require('node-cron');
const { ScheduledTask } = require('../models');

class Scheduler {
  constructor(mqttClient, gateway) {
    this.mqttClient = mqttClient;
    this.gateway = gateway;
    this.tasks = new Map();
  }

  async start() {
    const enabledTasks = await ScheduledTask.findAll({ where: { enabled: true } });
    
    for (const task of enabledTasks) {
      this.scheduleTask(task);
    }
    
    console.log(`Scheduler started with ${this.tasks.size} tasks`);
  }

  scheduleTask(task) {
    try {
      if (this.tasks.has(task.id)) {
        this.unscheduleTask(task.id);
      }

      const cronJob = cron.schedule(task.cronExpression, async () => {
        console.log(`Executing scheduled task: ${task.name}`);
        await this.executeTask(task);
      });

      this.tasks.set(task.id, cronJob);
      console.log(`Scheduled task: ${task.name} with cron: ${task.cronExpression}`);
    } catch (error) {
      console.error(`Failed to schedule task ${task.name}:`, error.message);
    }
  }

  unscheduleTask(taskId) {
    const cronJob = this.tasks.get(taskId);
    if (cronJob) {
      cronJob.stop();
      this.tasks.delete(taskId);
      console.log(`Unscheduled task with id: ${taskId}`);
    }
  }

  async executeTask(task) {
    try {
      const action = task.action;
      
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
        default:
          console.log(`Unknown action type: ${action.type}`);
      }

      await task.update({ lastExecuted: new Date() });
    } catch (error) {
      console.error(`Failed to execute task ${task.name}:`, error);
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
    
    console.log(`Applied scene: ${action.sceneId}`);
  }

  async setBrightness(action) {
    const controlData = { brightness: action.brightness };
    
    if (action.deviceIds) {
      action.deviceIds.forEach(deviceId => {
        if (this.gateway) {
          this.gateway.updateDevice(deviceId, controlData);
        }
        if (this.mqttClient) {
          this.mqttClient.publish(`blemesh/control/${deviceId}`, JSON.stringify(controlData));
        }
      });
    } else {
      if (this.gateway) {
        this.gateway.controlAllDevices(controlData);
      }
      if (this.mqttClient) {
        this.mqttClient.publish('blemesh/control/all', JSON.stringify(controlData));
      }
    }
  }

  async setColorTemperature(action) {
    const controlData = { colorTemperature: action.colorTemperature };
    
    if (action.deviceIds) {
      action.deviceIds.forEach(deviceId => {
        if (this.gateway) {
          this.gateway.updateDevice(deviceId, controlData);
        }
        if (this.mqttClient) {
          this.mqttClient.publish(`blemesh/control/${deviceId}`, JSON.stringify(controlData));
        }
      });
    } else {
      if (this.gateway) {
        this.gateway.controlAllDevices(controlData);
      }
      if (this.mqttClient) {
        this.mqttClient.publish('blemesh/control/all', JSON.stringify(controlData));
      }
    }
  }

  stop() {
    this.tasks.forEach((cronJob, taskId) => {
      cronJob.stop();
    });
    this.tasks.clear();
    console.log('Scheduler stopped');
  }
}

module.exports = Scheduler;
