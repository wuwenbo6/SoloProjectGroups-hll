<template>
  <div class="app">
    <header class="header">
      <h1>🌍 CYGNSS 土壤湿度反演系统</h1>
      <div class="stats">
        <div class="stat-item">
          <span class="stat-label">总数据点</span>
          <span class="stat-value">{{ statistics.total_records || 0 }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">平均湿度</span>
          <span class="stat-value">{{ (statistics.average_soil_moisture * 100).toFixed(1) }}%</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">平均SNR</span>
          <span class="stat-value">{{ statistics.average_snr?.toFixed(1) || 0 }} dB</span>
        </div>
      </div>
    </header>
    <div class="main-content">
      <GlobalMap
        :data="moistureData"
        @point-click="handlePointClick"
      />
      <TimeSeriesPanel
        :latitude="selectedPoint?.latitude"
        :longitude="selectedPoint?.longitude"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import GlobalMap from './components/GlobalMap.vue'
import TimeSeriesPanel from './components/TimeSeriesPanel.vue'

const moistureData = ref([])
const statistics = ref({})
const selectedPoint = ref(null)

const fetchData = async () => {
  try {
    const [moistureRes, statsRes] = await Promise.all([
      axios.get('/api/moisture'),
      axios.get('/api/statistics')
    ])
    moistureData.value = moistureRes.data.data
    statistics.value = statsRes.data
  } catch (error) {
    console.error('Error fetching data:', error)
  }
}

const handlePointClick = (point) => {
  selectedPoint.value = point
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.app {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  padding: 15px 30px;
  background: linear-gradient(135deg, #1a1f3a 0%, #2d3561 100%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header h1 {
  font-size: 22px;
  font-weight: 600;
  background: linear-gradient(90deg, #00d4ff, #7c3aed);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stats {
  display: flex;
  gap: 30px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #00d4ff;
}

.main-content {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 20px;
  padding: 20px;
  overflow: hidden;
}
</style>
