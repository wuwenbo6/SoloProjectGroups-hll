<template>
  <div>
    <header class="header">
      <h1>📊 sFlow 流量分析系统</h1>
      <div class="status">
        <span class="status-dot"></span>
        <span>{{ connected ? '实时连接中' : '连接断开' }}</span>
        <span>客户端: {{ stats.connected_clients || 0 }}</span>
        <span>上次更新: {{ lastUpdateTime }}</span>
        <span v-if="alertCount > 0" class="alert-badge" @click="activeTab = 'security'">
          🔔 {{ alertCount }}
        </span>
      </div>
    </header>

    <div class="container">
      <div class="tabs main-tabs">
        <button 
          class="tab" 
          :class="{ active: activeTab === 'overview' }"
          @click="activeTab = 'overview'"
        >📊 概览</button>
        <button 
          class="tab" 
          :class="{ active: activeTab === 'security' }"
          @click="activeTab = 'security'"
        >🛡️ 安全检测</button>
        <button 
          class="tab" 
          :class="{ active: activeTab === 'bgp' }"
          @click="activeTab = 'bgp'"
        >🌐 BGP路由</button>
        <button 
          class="tab" 
          :class="{ active: activeTab === 'report' }"
          @click="activeTab = 'report'"
        >📝 报表导出</button>
      </div>

      <div v-show="activeTab === 'overview'">
        <div class="filters">
          <div class="filter-group">
            <label>ASN 过滤</label>
            <select v-model="selectedASN" @change="applyASNFilter">
              <option :value="0">全部 ASN</option>
              <option v-for="asn in asns" :key="asn.asn" :value="asn.asn">
                AS{{ asn.asn }} - {{ asn.name }}
              </option>
            </select>
          </div>
          <div class="filter-group">
            <label>Top N</label>
            <select v-model="topN">
              <option :value="5">Top 5</option>
              <option :value="10">Top 10</option>
              <option :value="20">Top 20</option>
            </select>
          </div>
          <div class="filter-group">
            <label>时间范围</label>
            <select v-model="timeRange">
              <option value="1h">最近 1 小时</option>
              <option value="6h">最近 6 小时</option>
              <option value="24h">最近 24 小时</option>
              <option value="7d">最近 7 天</option>
            </select>
          </div>
          <div class="filter-group" style="align-self: flex-end;">
            <button class="btn" @click="loadHistoricalData">查询历史</button>
            <button class="btn btn-secondary" @click="sendMockData" style="margin-left: 8px;">发送模拟数据</button>
          </div>
        </div>

        <StatsOverview :stats="stats" />

        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-header">
              <h2>📈 流量趋势 (实时)</h2>
            </div>
            <TrafficChart :data="trafficData" ref="trafficChart" />
          </div>

          <div class="chart-card">
            <div class="chart-header">
              <h2>🔌 Top 应用协议</h2>
            </div>
            <div class="tabs">
              <button 
                class="tab" 
                :class="{ active: appViewMode === 'realtime' }"
                @click="appViewMode = 'realtime'"
              >实时</button>
              <button 
                class="tab" 
                :class="{ active: appViewMode === 'historical' }"
                @click="appViewMode = 'historical'"
              >历史</button>
            </div>
            <TopNChart 
              :data="appViewMode === 'realtime' ? topNData.apps : historicalTopN.apps" 
              type="apps" 
            />
          </div>

          <div class="chart-card full-width">
            <div class="chart-header">
              <h2>👥 Top IP 会话对</h2>
            </div>
            <div class="tabs">
              <button 
                class="tab" 
                :class="{ active: ipViewMode === 'realtime' }"
                @click="ipViewMode = 'realtime'"
              >实时</button>
              <button 
                class="tab" 
                :class="{ active: ipViewMode === 'historical' }"
                @click="ipViewMode = 'historical'"
              >历史</button>
            </div>
            <TopNTable 
              :data="ipViewMode === 'realtime' ? topNData.ip_pairs : historicalTopN.ip_pairs" 
              type="ip_pairs" 
            />
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'security'">
        <SecurityAlerts />
      </div>

      <div v-show="activeTab === 'bgp'">
        <BGPInfo />
      </div>

      <div v-show="activeTab === 'report'">
        <ReportExport />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { api } from './api.js'
import StatsOverview from './components/StatsOverview.vue'
import TrafficChart from './components/TrafficChart.vue'
import TopNChart from './components/TopNChart.vue'
import TopNTable from './components/TopNTable.vue'
import SecurityAlerts from './components/SecurityAlerts.vue'
import BGPInfo from './components/BGPInfo.vue'
import ReportExport from './components/ReportExport.vue'

const activeTab = ref('overview')
const connected = ref(false)
const lastUpdateTime = ref('--')
const selectedASN = ref(0)
const topN = ref(10)
const timeRange = ref('1h')
const appViewMode = ref('realtime')
const ipViewMode = ref('realtime')
const alertCount = ref(0)

const stats = reactive({
  receiver: {
    packets_received: 0,
    packets_dropped: 0,
    records_parsed: 0,
    bytes_received: 0,
    errors: 0
  },
  processor: {
    total_bytes: 0,
    total_packets: 0,
    flow_rate: 0,
    asn_filter: 0
  },
  storage: {
    total_records: 0,
    total_bytes: 0
  },
  connected_clients: 0
})

const topNData = reactive({
  ip_pairs: [],
  apps: []
})

const historicalTopN = reactive({
  ip_pairs: [],
  apps: []
})

const trafficData = ref([])
const asns = ref([])

let ws = null
const maxTrafficPoints = 60

const loadASNs = async () => {
  try {
    asns.value = await api.getASNs()
  } catch (e) {
    console.error('Failed to load ASNs:', e)
  }
}

const loadAlerts = async () => {
  try {
    const res = await api.getAlerts('active')
    alertCount.value = res.count || 0
  } catch (e) {
    console.error('Failed to load alerts:', e)
  }
}

const applyASNFilter = async () => {
  try {
    await api.setASNFilter(selectedASN.value)
    topNData.ip_pairs = []
    topNData.apps = []
  } catch (e) {
    console.error('Failed to set ASN filter:', e)
  }
}

const loadHistoricalData = async () => {
  const now = new Date()
  let startTime = new Date()
  
  switch (timeRange.value) {
    case '1h':
      startTime.setHours(now.getHours() - 1)
      break
    case '6h':
      startTime.setHours(now.getHours() - 6)
      break
    case '24h':
      startTime.setHours(now.getHours() - 24)
      break
    case '7d':
      startTime.setDate(now.getDate() - 7)
      break
  }

  const params = {
    start: startTime.toISOString(),
    end: now.toISOString(),
    limit: topN.value,
    asn: selectedASN.value || undefined
  }

  try {
    const [topNRes, trafficRes] = await Promise.all([
      api.getHistoricalTopN(params),
      api.getHistoricalTraffic(params)
    ])
    
    historicalTopN.ip_pairs = topNRes.ip_pairs || []
    historicalTopN.apps = topNRes.apps || []
    trafficData.value = trafficRes.map(t => ({
      time: t.time,
      bytes: t.bytes,
      packets: t.packets
    }))
  } catch (e) {
    console.error('Failed to load historical data:', e)
  }
}

const sendMockData = async () => {
  try {
    await api.sendMockFlow({ count: 100 })
  } catch (e) {
    console.error('Failed to send mock data:', e)
  }
}

const connectWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/api/ws`
  
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    connected.value = true
    console.log('WebSocket connected')
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      
      if (msg.type === 'topn') {
        topNData.ip_pairs = msg.data.ip_pairs || []
        topNData.apps = msg.data.apps || []
        
        const totalBytes = topNData.apps.reduce((sum, app) => sum + app.bytes, 0) +
                          topNData.ip_pairs.reduce((sum, pair) => sum + pair.bytes, 0)
        
        trafficData.value.push({
          time: new Date().toLocaleTimeString(),
          bytes: totalBytes,
          packets: topNData.ip_pairs.reduce((sum, pair) => sum + pair.packets, 0)
        })
        
        if (trafficData.value.length > maxTrafficPoints) {
          trafficData.value = trafficData.value.slice(-maxTrafficPoints)
        }
        
        lastUpdateTime.value = new Date(msg.timestamp).toLocaleTimeString()
      } else if (msg.type === 'stats') {
        Object.assign(stats, msg.data)
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e)
    }
  }

  ws.onclose = () => {
    connected.value = false
    console.log('WebSocket disconnected, retrying...')
    setTimeout(connectWebSocket, 3000)
  }

  ws.onerror = (e) => {
    console.error('WebSocket error:', e)
    ws.close()
  }
}

const loadInitialData = async () => {
  try {
    const [statsRes, topNRes] = await Promise.all([
      api.getStats(),
      api.getTopN(topN.value)
    ])
    Object.assign(stats, statsRes)
    topNData.ip_pairs = topNRes.ip_pairs || []
    topNData.apps = topNRes.apps || []
  } catch (e) {
    console.error('Failed to load initial data:', e)
  }
}

onMounted(() => {
  loadASNs()
  loadInitialData()
  loadAlerts()
  connectWebSocket()
  
  const alertInterval = setInterval(loadAlerts, 5000)
  
  onUnmounted(() => {
    clearInterval(alertInterval)
  })
})

onUnmounted(() => {
  if (ws) {
    ws.close()
  }
})
</script>

<style scoped>
.main-tabs {
  margin-bottom: 20px;
}

.alert-badge {
  background: #ef4444;
  color: white;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
</style>
