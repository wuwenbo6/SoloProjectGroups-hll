<template>
  <div class="container">
    <header class="header">
      <h1>🔮 液位监测系统</h1>
      <div class="connection-status">
        <span class="status-dot" :class="{ connected: wsConnected }"></span>
        <span>{{ wsConnected ? '实时连接中' : '连接断开' }}</span>
      </div>
    </header>

    <div class="toolbar">
      <button class="btn btn-primary" @click="showAddModal = true">
        + 添加储罐
      </button>
      <button class="btn btn-primary" v-if="selectedTank" @click="simulateData">
        🔄 模拟数据
      </button>
    </div>

    <div class="tank-grid">
      <div
        v-for="tank in tanks"
        :key="tank.id"
        class="tank-card"
        :class="[tank.status, { selected: selectedTank?.id === tank.id }]"
        @click="selectTank(tank)"
      >
        <div class="tank-name">{{ tank.name }}</div>
        <div class="tank-level">
          {{ tank.level !== null ? tank.level.toFixed(2) : '--' }}
          <span style="font-size: 1rem; color: #9ca3af;">m</span>
        </div>
        <div class="tank-meta">
          <span>温度: {{ tank.temperature !== null ? tank.temperature.toFixed(1) : '--' }}°C</span>
          <span class="status-badge" :class="'status-' + tank.status">
            {{ getStatusText(tank.status) }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="selectedTank" class="card">
      <h2>📊 {{ selectedTank.name }} - 详细信息</h2>
      
      <div class="detail-view">
        <div class="tank-visual">
          <div class="tank-body">
            <div
              class="liquid"
              :style="{ height: getLiquidHeight() + '%' }"
            ></div>
          </div>
          <div class="tank-label">
            <div class="level-value">
              {{ selectedTank.level !== null ? selectedTank.level.toFixed(2) : '--' }}
            </div>
            <div class="level-unit">米</div>
          </div>
        </div>

        <div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">当前液位</div>
              <div class="info-value">{{ selectedTank.level !== null ? selectedTank.level.toFixed(2) : '--' }} m</div>
            </div>
            <div class="info-item">
              <div class="info-label">当前温度</div>
              <div class="info-value">{{ selectedTank.temperature !== null ? selectedTank.temperature.toFixed(1) : '--' }} °C</div>
            </div>
            <div class="info-item">
              <div class="info-label">储罐高度</div>
              <div class="info-value">{{ selectedTank.max_height }} m</div>
            </div>
            <div class="info-item">
              <div class="info-label">液位百分比</div>
              <div class="info-value">{{ getLevelPercentage() }}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedTank" class="two-column">
      <div class="card">
        <h2>📈 液位趋势图</h2>
        <div class="chart-container">
          <v-chart class="chart" :option="trendChartOption" autoresize />
        </div>
      </div>

      <div class="card">
        <h2>🌊 回波波形图</h2>
        <div class="chart-container">
          <v-chart class="chart" :option="waveformChartOption" autoresize />
        </div>
      </div>
    </div>

    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>添加储罐</h3>
          <button class="close-btn" @click="showAddModal = false">&times;</button>
        </div>
        <form @submit.prevent="addTank">
          <div class="form-group">
            <label>储罐名称</label>
            <input v-model="newTank.name" type="text" required />
          </div>
          <div class="form-group">
            <label>描述</label>
            <input v-model="newTank.description" type="text" />
          </div>
          <div class="form-group">
            <label>储罐最大高度 (米)</label>
            <input v-model.number="newTank.max_height" type="number" step="0.1" min="0.1" required />
          </div>
          <div class="form-group">
            <label>传感器安装高度 (米)</label>
            <input v-model.number="newTank.sensor_height" type="number" step="0.1" min="0.1" required />
          </div>
          <div class="form-group">
            <label>最低液位报警阈值 (米)</label>
            <input v-model.number="newTank.min_level" type="number" step="0.1" min="0" />
          </div>
          <div class="form-group">
            <label>最高液位报警阈值 (米)</label>
            <input v-model.number="newTank.max_level" type="number" step="0.1" min="0.1" required />
          </div>
          <div class="form-group">
            <label>安装位置</label>
            <input v-model="newTank.location" type="text" />
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">
            创建储罐
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import axios from 'axios'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent
])

const tanks = ref([])
const selectedTank = ref(null)
const wsConnected = ref(false)
const showAddModal = ref(false)
const trendData = ref([])
const waveformData = ref([])

const newTank = ref({
  name: '',
  description: '',
  max_height: 10,
  sensor_height: 10.5,
  min_level: 1,
  max_level: 9,
  location: ''
})

let ws = null

const trendChartOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderColor: 'rgba(255,255,255,0.1)',
    textStyle: { color: '#fff' }
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: '10%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: trendData.value.map(d => d.time?.split('T')[1]?.slice(0, 5) || ''),
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
    axisLabel: { color: '#9ca3af' }
  },
  yAxis: {
    type: 'value',
    name: '液位 (m)',
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
    axisLabel: { color: '#9ca3af' },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
  },
  series: [
    {
      name: '液位',
      type: 'line',
      smooth: true,
      symbol: 'none',
      data: trendData.value.map(d => d.level || 0),
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(0,212,255,0.5)' },
            { offset: 1, color: 'rgba(0,212,255,0)' }
          ]
        }
      },
      lineStyle: { color: '#00d4ff', width: 2 }
    }
  ]
}))

const waveformChartOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderColor: 'rgba(255,255,255,0.1)',
    textStyle: { color: '#fff' }
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: '10%',
    containLabel: true
  },
  xAxis: {
    type: 'category',
    data: waveformData.value.map((_, i) => i),
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
    axisLabel: { color: '#9ca3af' }
  },
  yAxis: {
    type: 'value',
    name: '振幅',
    axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
    axisLabel: { color: '#9ca3af' },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
  },
  series: [
    {
      name: '波形',
      type: 'line',
      smooth: true,
      symbol: 'none',
      data: waveformData.value,
      lineStyle: { color: '#7c3aed', width: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(124,58,237,0.3)' },
            { offset: 1, color: 'rgba(124,58,237,0)' }
          ]
        }
      }
    }
  ]
}))

function getStatusText(status) {
  const map = {
    normal: '正常',
    warning: '预警',
    alarm: '报警',
    offline: '离线'
  }
  return map[status] || '未知'
}

function getLiquidHeight() {
  if (!selectedTank.value || selectedTank.value.level === null) return 0
  return Math.min(100, (selectedTank.value.level / selectedTank.value.max_height) * 100)
}

function getLevelPercentage() {
  if (!selectedTank.value || selectedTank.value.level === null) return 0
  return Math.round((selectedTank.value.level / selectedTank.value.max_height) * 100)
}

async function loadTanks() {
  try {
    const res = await axios.get('/api/tanks')
    tanks.value = res.data.tanks
  } catch (e) {
    console.error('加载储罐列表失败:', e)
  }
}

async function addTank() {
  try {
    await axios.post('/api/tanks', newTank.value)
    showAddModal.value = false
    loadTanks()
    newTank.value = {
      name: '',
      description: '',
      max_height: 10,
      sensor_height: 10.5,
      min_level: 1,
      max_level: 9,
      location: ''
    }
  } catch (e) {
    console.error('添加储罐失败:', e)
  }
}

function selectTank(tank) {
  selectedTank.value = tank
  loadTrendData(tank.id)
  loadWaveform(tank.id)
}

async function loadTrendData(tankId) {
  try {
    const res = await axios.get(`/api/trends/${tankId}`, {
      params: { start_time: '-1h', aggregate: '1m' }
    })
    trendData.value = res.data.data.slice(-50)
  } catch (e) {
    console.error('加载趋势数据失败:', e)
  }
}

async function loadWaveform(tankId) {
  try {
    const res = await axios.get(`/api/sensor/waveform/${tankId}`)
    waveformData.value = res.data.waveform
  } catch (e) {
    waveformData.value = Array(100).fill(0)
  }
}

async function simulateData() {
  if (!selectedTank.value) return
  try {
    await axios.get(`/api/sensor/simulate/${selectedTank.value.id}`)
    loadTrendData(selectedTank.value.id)
    loadWaveform(selectedTank.value.id)
  } catch (e) {
    console.error('模拟数据失败:', e)
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws/realtime`
  
  ws = new WebSocket(wsUrl)
  
  ws.onopen = () => {
    wsConnected.value = true
    console.log('WebSocket 已连接')
  }
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.type === 'tank_status') {
      tanks.value = data.data
      
      if (selectedTank.value) {
        const updated = data.data.find(t => t.id === selectedTank.value.id)
        if (updated) {
          selectedTank.value = updated
        }
      }
    }
  }
  
  ws.onclose = () => {
    wsConnected.value = false
    console.log('WebSocket 断开，3秒后重连...')
    setTimeout(connectWebSocket, 3000)
  }
  
  ws.onerror = (e) => {
    console.error('WebSocket 错误:', e)
  }
}

watch(selectedTank, (newTank) => {
  if (newTank) {
    loadTrendData(newTank.id)
    loadWaveform(newTank.id)
  }
})

onMounted(() => {
  loadTanks()
  connectWebSocket()
  
  setInterval(() => {
    if (selectedTank.value) {
      loadWaveform(selectedTank.value.id)
    }
  }, 5000)
})

onUnmounted(() => {
  if (ws) {
    ws.close()
  }
})
</script>

<style scoped>
.chart {
  height: 100%;
  width: 100%;
}
</style>
