import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

api.interceptors.response.use(
  response => {
    if (response.data && response.data.success) {
      return response.data.data
    }
    return Promise.reject(response.data?.message || '请求失败')
  },
  error => {
    return Promise.reject(error.response?.data?.detail || error.message)
  }
)

export const poolApi = {
  list: () => api.get('/pools'),
  listWithImages: () => api.get('/pools/detail')
}

export const imageApi = {
  list: (pool) => api.get(`/pools/${pool}/images`),
  get: (name, pool) => api.get(`/images/${name}`, { params: { pool } }),
  create: (data) => api.post('/images', data),
  delete: (data) => api.delete('/images', { data })
}

export const snapshotApi = {
  list: (imageName, pool) => api.get(`/images/${imageName}/snapshots`, { params: { pool } }),
  create: (data) => api.post('/snapshots', data),
  delete: (data) => api.delete('/snapshots', { data }),
  protect: (data) => api.post('/snapshots/protect', data),
  unprotect: (data) => api.post('/snapshots/unprotect', data)
}

export const cloneApi = {
  create: (data) => api.post('/clones', data),
  flatten: (data) => api.post('/clones/flatten', data),
  batchFlatten: (data) => api.post('/clones/batch-flatten', data),
  flattenDeep: (pool, minDepth = 5) => api.post('/clones/flatten-deep', null, { params: { pool, min_depth: minDepth } }),
  getChainPath: (imageName, pool) => api.get(`/images/${imageName}/clone-chain`, { params: { pool } })
}

export const warningApi = {
  getDepthWarnings: () => api.get('/warnings/depth')
}

export const treeApi = {
  getSnapshotTree: (imageName, pool) => api.get(`/images/${imageName}/snapshot-tree`, { params: { pool } }),
  getCompleteTree: () => api.get('/tree'),
  exportTopology: (format = 'json') => api.get('/topology/export', { params: { format } })
}

export default api
