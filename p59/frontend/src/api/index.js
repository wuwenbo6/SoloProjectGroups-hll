import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

export const userApi = {
  list: () => api.get('/users/'),
  create: (data) => api.post('/users/', data),
  get: (id) => api.get(`/users/${id}`),
  update: (id, data) => api.put(`/users/${id}`, data)
}

export const pillboxApi = {
  list: () => api.get('/pillboxes/'),
  create: (data) => api.post('/pillboxes/', data),
  get: (id) => api.get(`/pillboxes/${id}`)
}

export const planApi = {
  list: (userId) => api.get('/plans/', { params: { user_id: userId } }),
  create: (data) => api.post('/plans/', data),
  update: (id, data) => api.put(`/plans/${id}`, data),
  delete: (id) => api.delete(`/plans/${id}`),
  refill: (id, data) => api.post(`/plans/${id}/refill`, data),
  getRefills: (id) => api.get(`/plans/${id}/refills`)
}

export const recordApi = {
  list: (userId, limit = 50) => api.get('/records/', { params: { user_id: userId, limit } })
}

export const sensorLogApi = {
  list: (pillboxId, limit = 50) => api.get('/sensor-logs/', { params: { pillbox_id: pillboxId, limit } })
}

export const alertApi = {
  getLowStock: () => api.get('/alerts/low-stock')
}

export const ttsApi = {
  generate: (text, voice = 'default', speed = 1.0) => 
    api.post('/tts/generate', { text, voice, speed }, { responseType: 'blob' }),
  getReminder: (recordId) => 
    api.get(`/tts/reminder/${recordId}`, { responseType: 'blob' })
}

export const reportApi = {
  exportCsv: (user_id, start_date, end_date) => 
    api.post('/reports/export/csv', { user_id, start_date, end_date }, { responseType: 'blob' }),
  getSummary: (user_id, start_date, end_date) => 
    api.post('/reports/summary', { user_id, start_date, end_date }),
  getDaily: (user_id, date) => 
    api.get(`/reports/daily/${user_id}`, { params: { date } })
}

export default api
