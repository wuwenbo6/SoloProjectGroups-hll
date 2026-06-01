import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

export const executeQuery = (query) => {
  return api.post('/query', { query })
}

export const getGraphData = () => {
  return api.get('/graph')
}

export const exportGraphSON = () => {
  return api.get('/export')
}

export const importGraphSON = (graphson) => {
  return api.post('/import', { graphson })
}

export const exportCsv = (results) => {
  return api.post('/export/csv', { results }, {
    responseType: 'blob'
  })
}

export const findShortestPath = (fromId, toId, edgeLabel, maxDepth) => {
  return api.get('/shortest-path', {
    params: { fromId, toId, edgeLabel, maxDepth }
  })
}

export const listIndexes = () => {
  return api.get('/indexes')
}

export const createIndex = (indexName, elementType, propertyKey) => {
  return api.post('/indexes', { indexName, elementType, propertyKey })
}

export const dropIndex = (indexName, elementType) => {
  return api.delete(`/indexes/${indexName}`, {
    params: { elementType }
  })
}

export const getQueryHistory = (page = 0, size = 20) => {
  return api.get('/history', { params: { page, size } })
}

export const deleteQueryHistory = (id) => {
  return api.delete(`/history/${id}`)
}

export const clearQueryHistory = () => {
  return api.delete('/history')
}

export default api
