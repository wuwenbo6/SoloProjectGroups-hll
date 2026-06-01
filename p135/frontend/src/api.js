import axios from 'axios'

const API_BASE = '/api'

export const api = {
  async getStats() {
    const res = await axios.get(`${API_BASE}/stats`)
    return res.data
  },

  async getTopN(limit = 10) {
    const res = await axios.get(`${API_BASE}/topn`, { params: { limit } })
    return res.data
  },

  async getHistorical(params) {
    const res = await axios.get(`${API_BASE}/historical`, { params })
    return res.data
  },

  async getHistoricalTopN(params) {
    const res = await axios.get(`${API_BASE}/historical/topn`, { params })
    return res.data
  },

  async getHistoricalTraffic(params) {
    const res = await axios.get(`${API_BASE}/historical/traffic`, { params })
    return res.data
  },

  async getASNs() {
    const res = await axios.get(`${API_BASE}/asns`)
    return res.data
  },

  async setASNFilter(asn) {
    const res = await axios.post(`${API_BASE}/filter/asn`, { asn })
    return res.data
  },

  async getASNFilter() {
    const res = await axios.get(`${API_BASE}/filter/asn`)
    return res.data
  },

  async sendMockFlow(data) {
    const res = await axios.post(`${API_BASE}/mock`, data)
    return res.data
  },

  async getAlerts(status = '') {
    const res = await axios.get(`${API_BASE}/alerts`, { params: { status } })
    return res.data
  },

  async getBaseline() {
    const res = await axios.get(`${API_BASE}/alerts/baseline`)
    return res.data
  },

  async getTopOffenders(limit = 10) {
    const res = await axios.get(`${API_BASE}/alerts/offenders`, { params: { limit } })
    return res.data
  },

  async updateAlertConfig(config) {
    const res = await axios.post(`${API_BASE}/alerts/config`, config)
    return res.data
  },

  async bgpLookup(ip) {
    const res = await axios.get(`${API_BASE}/bgp/lookup/${ip}`)
    return res.data
  },

  async getBGPRoutes() {
    const res = await axios.get(`${API_BASE}/bgp/routes`)
    return res.data
  },

  async addBGPRoute(route) {
    const res = await axios.post(`${API_BASE}/bgp/routes`, route)
    return res.data
  },

  async removeBGPRoute(prefix) {
    const res = await axios.delete(`${API_BASE}/bgp/routes/${prefix}`)
    return res.data
  },

  async getBGPStats() {
    const res = await axios.get(`${API_BASE}/bgp/stats`)
    return res.data
  },

  async importPrefixes(prefixes) {
    const res = await axios.post(`${API_BASE}/bgp/import`, { prefixes })
    return res.data
  }
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatPackets(packets) {
  if (packets >= 1000000) {
    return (packets / 1000000).toFixed(2) + ' M'
  } else if (packets >= 1000) {
    return (packets / 1000).toFixed(2) + ' K'
  }
  return packets.toString()
}

export function getProtocolBadge(protocol) {
  const p = protocol.toLowerCase()
  if (p === 'tcp') return 'badge-tcp'
  if (p === 'udp') return 'badge-udp'
  if (p === 'icmp') return 'badge-icmp'
  return 'badge-other'
}
