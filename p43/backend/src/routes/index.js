const express = require('express');
const DeviceController = require('../controllers/deviceController');
const SceneController = require('../controllers/sceneController');
const SensorController = require('../controllers/sensorController');
const AutomationController = require('../controllers/automationController');
const EnergyController = require('../controllers/energyController');
const LogController = require('../controllers/logController');

function createRoutes(mqttClient, gateway, scheduler, automationEngine, logService, energyService, daylightService) {
  const router = express.Router();

  const deviceController = new DeviceController(mqttClient, gateway, logService);
  const sceneController = new SceneController(mqttClient, gateway, logService);
  const sensorController = new SensorController(mqttClient);
  const automationController = new AutomationController(scheduler, automationEngine, logService);
  const energyController = new EnergyController(energyService, daylightService);
  const logController = new LogController(logService);

  router.get('/devices', deviceController.getAllDevices.bind(deviceController));
  router.get('/devices/:id', deviceController.getDeviceById.bind(deviceController));
  router.post('/devices', deviceController.createDevice.bind(deviceController));
  router.put('/devices/:id', deviceController.updateDevice.bind(deviceController));
  router.delete('/devices/:id', deviceController.deleteDevice.bind(deviceController));
  router.post('/devices/:id/control', deviceController.controlDevice.bind(deviceController));
  router.post('/devices/control/all', deviceController.controlAllDevices.bind(deviceController));
  router.post('/devices/sync', deviceController.syncDevicesFromGateway.bind(deviceController));

  router.get('/scenes', sceneController.getAllScenes.bind(sceneController));
  router.get('/scenes/:id', sceneController.getSceneById.bind(sceneController));
  router.post('/scenes', sceneController.createScene.bind(sceneController));
  router.put('/scenes/:id', sceneController.updateScene.bind(sceneController));
  router.delete('/scenes/:id', sceneController.deleteScene.bind(sceneController));
  router.post('/scenes/:id/apply', sceneController.applyScene.bind(sceneController));

  router.get('/sensors', sensorController.getAllSensors.bind(sensorController));
  router.get('/sensors/:id', sensorController.getSensorById.bind(sensorController));
  router.post('/sensors', sensorController.createSensor.bind(sensorController));
  router.put('/sensors/:id', sensorController.updateSensor.bind(sensorController));
  router.delete('/sensors/:id', sensorController.deleteSensor.bind(sensorController));
  router.post('/sensors/:id/value', sensorController.updateSensorValue.bind(sensorController));
  router.post('/sensors/simulate', sensorController.simulateSensorData.bind(sensorController));

  router.get('/scheduled-tasks', automationController.getAllScheduledTasks.bind(automationController));
  router.post('/scheduled-tasks', automationController.createScheduledTask.bind(automationController));
  router.put('/scheduled-tasks/:id', automationController.updateScheduledTask.bind(automationController));
  router.delete('/scheduled-tasks/:id', automationController.deleteScheduledTask.bind(automationController));

  router.get('/automation-rules', automationController.getAllAutomationRules.bind(automationController));
  router.post('/automation-rules', automationController.createAutomationRule.bind(automationController));
  router.put('/automation-rules/:id', automationController.updateAutomationRule.bind(automationController));
  router.delete('/automation-rules/:id', automationController.deleteAutomationRule.bind(automationController));
  router.post('/automation-rules/:id/trigger', automationController.triggerAutomationRule.bind(automationController));

  router.get('/energy/summary', energyController.getSummary.bind(energyController));
  router.get('/energy/stats', energyController.getStats.bind(energyController));
  router.get('/energy/comparison', energyController.getComparison.bind(energyController));
  router.get('/energy/daylight', energyController.getDaylightInfo.bind(energyController));

  router.get('/logs', logController.getLogs.bind(logController));
  router.get('/logs/export', logController.exportLogs.bind(logController));
  router.get('/logs/stats', logController.getStats.bind(logController));

  return router;
}

module.exports = createRoutes;
