import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
});

export const nodeAPI = {
  getNodes: () => api.get('/nodes'),
  getNode: (id) => api.get(`/nodes/${id}`),
  getNodeHistory: (id, limit = 100) => api.get(`/nodes/${id}/history?limit=${limit}`),
  registerNode: (data) => api.post('/nodes/register', data),
  heartbeat: (data) => api.post('/nodes/heartbeat', data),
  deleteNode: (id) => api.delete(`/nodes/${id}`),
};

export const serviceAPI = {
  getServices: () => api.get('/services'),
  getService: (id) => api.get(`/services/${id}`),
  createService: (data) => api.post('/services', data),
  deleteService: (id) => api.delete(`/services/${id}`),
};

export const clusterAPI = {
  sync: () => api.post('/sync'),
  getDeploymentHistory: (limit = 100) => api.get(`/deployments/history?limit=${limit}`),
  triggerFailover: (nodeId) => api.post(`/failover/${nodeId}`),
  health: () => api.get('/health'),
  getReport: () => api.get('/report'),
  exportReport: (format = 'json') => api.get(`/report/export?format=${format}`, { responseType: 'blob' }),
};

export default api;
