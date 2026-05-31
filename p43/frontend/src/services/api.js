import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const deviceAPI = {
  getAllDevices: () => api.get('/devices'),
  getDevice: (id) => api.get(`/devices/${id}`),
  createDevice: (device) => api.post('/devices', device),
  updateDevice: (id, device) => api.put(`/devices/${id}`, device),
  deleteDevice: (id) => api.delete(`/devices/${id}`),
  controlDevice: (id, data) => api.post(`/devices/${id}/control`, data),
  controlAllDevices: (data) => api.post('/devices/control/all', data),
  syncDevices: () => api.post('/devices/sync'),
};

export const sceneAPI = {
  getAllScenes: () => api.get('/scenes'),
  getScene: (id) => api.get(`/scenes/${id}`),
  createScene: (scene) => api.post('/scenes', scene),
  updateScene: (id, scene) => api.put(`/scenes/${id}`, scene),
  deleteScene: (id) => api.delete(`/scenes/${id}`),
  applyScene: (id, data = {}) => api.post(`/scenes/${id}/apply`, data),
};

export const sensorAPI = {
  getAllSensors: () => api.get('/sensors'),
  getSensor: (id) => api.get(`/sensors/${id}`),
  createSensor: (sensor) => api.post('/sensors', sensor),
  updateSensor: (id, sensor) => api.put(`/sensors/${id}`, sensor),
  deleteSensor: (id) => api.delete(`/sensors/${id}`),
  updateSensorValue: (id, value) => api.post(`/sensors/${id}/value`, { value }),
  simulateSensors: () => api.post('/sensors/simulate'),
};

export const scheduledTaskAPI = {
  getAllTasks: () => api.get('/scheduled-tasks'),
  createTask: (task) => api.post('/scheduled-tasks', task),
  updateTask: (id, task) => api.put(`/scheduled-tasks/${id}`, task),
  deleteTask: (id) => api.delete(`/scheduled-tasks/${id}`),
};

export const automationRuleAPI = {
  getAllRules: () => api.get('/automation-rules'),
  createRule: (rule) => api.post('/automation-rules', rule),
  updateRule: (id, rule) => api.put(`/automation-rules/${id}`, rule),
  deleteRule: (id) => api.delete(`/automation-rules/${id}`),
  triggerRule: (id) => api.post(`/automation-rules/${id}/trigger`),
};

export const energyAPI = {
  getSummary: (params) => api.get('/energy/summary', { params }),
  getStats: (params) => api.get('/energy/stats', { params }),
  getComparison: (params) => api.get('/energy/comparison', { params }),
  getDaylightInfo: () => api.get('/energy/daylight'),
};

export const logAPI = {
  getLogs: (params) => api.get('/logs', { params }),
  exportLogs: (params) => api.get('/logs/export', { params, responseType: 'blob' }),
  getStats: (params) => api.get('/logs/stats', { params }),
};

export const healthCheck = () => api.get('/health');

export default api;
