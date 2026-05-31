import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

export const getDashboardStats = () => api.get('/dashboard/stats')
export const getDevices = () => api.get('/devices')
export const getDevice = (id) => api.get(`/devices/${id}`)
export const updateDevice = (id, data) => api.put(`/devices/${id}`, data)
export const getSensorHistory = (id, limit = 100) => api.get(`/devices/${id}/history?limit=${limit}`)
export const sendCommand = (id, command) => api.post(`/devices/${id}/command`, command)

export const getRules = () => api.get('/rules')
export const createRule = (data) => api.post('/rules', data)
export const updateRule = (id, data) => api.put(`/rules/${id}`, data)
export const deleteRule = (id) => api.delete(`/rules/${id}`)

export const getScenes = () => api.get('/scenes')
export const createScene = (data) => api.post('/scenes', data)
export const updateScene = (id, data) => api.put(`/scenes/${id}`, data)
export const deleteScene = (id) => api.delete(`/scenes/${id}`)
export const triggerScene = (id) => api.post(`/scenes/${id}/trigger`)

export const getAnomalies = (limit = 100) => api.get(`/anomalies?limit=${limit}`)
export const getDiagnostics = () => api.get('/diagnostics')
export const getDeviceDiagnostic = (id) => api.get(`/devices/${id}/diagnostic`)
export const generateReport = (days = 7) => api.get(`/report?days=${days}`)
export const exportReport = (days = 7, format = 'json') => api.get(`/report/export?days=${days}&format=${format}`, { responseType: 'blob' })

export default api
