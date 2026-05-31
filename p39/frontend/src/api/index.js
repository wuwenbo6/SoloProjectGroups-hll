import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

export const getCurrentCount = (zone) => {
  return api.get('/count/current', { params: { zone } })
}

export const getCountHistory = (params) => {
  return api.get('/count/history', { params })
}

export const getHeatmap = () => {
  return api.get('/heatmap')
}

export const getTrend = (zone, predictionSteps = 12) => {
  return api.get('/trend', { params: { zone, prediction_steps: predictionSteps } })
}

export const getZones = () => {
  return api.get('/zones')
}

export const createZone = (data) => {
  return api.post('/zones', data)
}

export const sendProbeData = (data) => {
  return api.post('/probe', data)
}

export const sendBatchProbeData = (data) => {
  return api.post('/probe/batch', data)
}

export const getDisplayData = (displayId, zone) => {
  return api.get(`/display/${displayId}`, { params: { zone } })
}

export const getSeatOccupancy = (zone) => {
  return api.get('/seat/occupancy', { params: { zone } })
}

export const getStayDistribution = (zone) => {
  return api.get('/seat/distribution', { params: { zone } })
}

export const getTrainSchedules = () => {
  return api.get('/trains/schedules')
}

export const getDepartingTrains = (nextMinutes) => {
  return api.get('/trains/departing', { params: { next_minutes: nextMinutes } })
}

export const getTrainForecast = (zone, minutesAhead) => {
  return api.get('/trains/forecast', { params: { zone, minutes_ahead: minutesAhead } })
}

export const getWaitingTime = (zone) => {
  return api.get('/trains/waiting-time', { params: { zone } })
}

export const getReportSummary = (params) => {
  return api.get('/reports/summary', { params })
}

export const getDailyReport = (reportDate) => {
  return api.get('/reports/daily', { params: { report_date: reportDate } })
}

export const exportCSV = (params) => {
  return api.get('/reports/export/csv', {
    params,
    responseType: 'blob'
  })
}

export default api
