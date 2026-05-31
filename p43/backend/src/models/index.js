const sequelize = require('../config/database');
const Device = require('./Device');
const Scene = require('./Scene');
const ScheduledTask = require('./ScheduledTask');
const Sensor = require('./Sensor');
const AutomationRule = require('./AutomationRule');
const ControlLog = require('./ControlLog');
const EnergyStats = require('./EnergyStats');

const initDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    await sequelize.sync({ alter: true });
    console.log('Database models synchronized.');

    await createPresetScenes();
    await createDefaultSensors();
    await createDefaultAutomationRules();
    
    console.log('Database initialization completed.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};

const createPresetScenes = async () => {
  const presetScenes = [
    {
      id: 'meeting',
      name: '会议模式',
      description: '适合会议讨论的明亮灯光',
      brightness: 80,
      colorTemperature: 4500,
      isPreset: true
    },
    {
      id: 'off-duty',
      name: '下班模式',
      description: '关闭大部分灯光，保留照明',
      brightness: 10,
      colorTemperature: 3000,
      isPreset: true
    },
    {
      id: 'presentation',
      name: '演示模式',
      description: '适合投影演示的柔和灯光',
      brightness: 50,
      colorTemperature: 4000,
      isPreset: true
    },
    {
      id: 'lunch',
      name: '午餐模式',
      description: '午休时的柔和灯光',
      brightness: 30,
      colorTemperature: 3500,
      isPreset: true
    },
    {
      id: 'all-on',
      name: '全部开启',
      description: '所有灯光全亮',
      brightness: 100,
      colorTemperature: 4000,
      isPreset: true
    },
    {
      id: 'all-off',
      name: '全部关闭',
      description: '所有灯光关闭',
      brightness: 0,
      colorTemperature: 4000,
      isPreset: true
    }
  ];

  for (const scene of presetScenes) {
    await Scene.findOrCreate({
      where: { id: scene.id },
      defaults: scene
    });
  }
};

const createDefaultSensors = async () => {
  const defaultSensors = [
    { id: 'sensor-motion-001', name: '运动传感器 A1', type: 'motion', area: '办公区A', unit: 'boolean' },
    { id: 'sensor-motion-002', name: '运动传感器 A2', type: 'motion', area: '办公区B', unit: 'boolean' },
    { id: 'sensor-light-001', name: '光照传感器 L1', type: 'light', area: '大厅', unit: 'lux' },
    { id: 'sensor-light-002', name: '光照传感器 L2', type: 'light', area: '休息区', unit: 'lux' },
    { id: 'sensor-temp-001', name: '温度传感器 T1', type: 'temperature', area: '会议室A', unit: '°C' },
    { id: 'sensor-temp-002', name: '温度传感器 T2', type: 'temperature', area: '会议室B', unit: '°C' },
    { id: 'sensor-occupancy-001', name: '人体感应 O1', type: 'occupancy', area: '会议室A', unit: 'boolean' },
    { id: 'sensor-occupancy-002', name: '人体感应 O2', type: 'occupancy', area: '会议室B', unit: 'boolean' }
  ];

  for (const sensor of defaultSensors) {
    await Sensor.findOrCreate({
      where: { id: sensor.id },
      defaults: { ...sensor, value: 0, online: true }
    });
  }
};

const createDefaultAutomationRules = async () => {
  const defaultRules = [
    {
      name: '感应开灯',
      description: '检测到运动时自动开灯',
      triggerType: 'sensor',
      triggerCondition: { sensorId: 'sensor-motion-001', operator: 'equals', value: 1 },
      action: { type: 'scene', sceneId: 'meeting', targetAreas: ['办公区A'] },
      enabled: true
    },
    {
      name: '人走灯灭',
      description: '5分钟无人自动关灯',
      triggerType: 'sensor',
      triggerCondition: { sensorId: 'sensor-occupancy-001', operator: 'equals', value: 0, duration: 300 },
      action: { type: 'scene', sceneId: 'off-duty', targetAreas: ['会议室A'] },
      enabled: true
    },
    {
      name: '自动亮度调节',
      description: '根据环境光调节亮度',
      triggerType: 'sensor',
      triggerCondition: { sensorId: 'sensor-light-001', operator: 'less_than', value: 500 },
      action: { type: 'brightness', brightness: 80, targetAreas: ['大厅'] },
      enabled: true
    },
    {
      name: '日光补偿',
      description: '根据自然光强度自动调节灯光亮度',
      triggerType: 'daylight',
      triggerCondition: { sensorId: 'sensor-light-001', targetLux: 800, minBrightness: 20, maxBrightness: 100 },
      action: { type: 'daylight_compensation', targetAreas: ['办公区A', '办公区B', '大厅'] },
      enabled: true
    }
  ];

  for (const rule of defaultRules) {
    const existing = await AutomationRule.findOne({ where: { name: rule.name } });
    if (!existing) {
      await AutomationRule.create(rule);
    }
  }
};

module.exports = {
  sequelize,
  Device,
  Scene,
  ScheduledTask,
  Sensor,
  AutomationRule,
  ControlLog,
  EnergyStats,
  initDatabase
};
