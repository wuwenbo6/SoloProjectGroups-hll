<template>
  <div class="panel">
    <div class="panel-header">
      <h2>时间序列分析</h2>
      <div v-if="latitude !== undefined" class="coords">
        <span>{{ latitude.toFixed(2) }}°N, {{ longitude.toFixed(2) }}°E</span>
      </div>
    </div>
    
    <div v-if="latitude === undefined" class="empty-state">
      <div class="empty-icon">📍</div>
      <p>点击地图上的数据点查看时间序列</p>
    </div>
    
    <div v-else class="chart-container">
      <div class="date-range">
        <input type="date" v-model="startDate" class="date-input" />
        <span class="date-separator">至</span>
        <input type="date" v-model="endDate" class="date-input" />
        <button @click="fetchTimeSeries" class="refresh-btn">刷新</button>
      </div>
      <div ref="chartRef" class="chart"></div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card-label">数据点数</div>
          <div class="stat-card-value">{{ timeSeriesData.length }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">平均湿度</div>
          <div class="stat-card-value">{{ (avgMoisture * 100).toFixed(1) }}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">最大湿度</div>
          <div class="stat-card-value">{{ (maxMoisture * 100).toFixed(1) }}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">最小湿度</div>
          <div class="stat-card-value">{{ (minMoisture * 100).toFixed(1) }}%</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import axios from 'axios'

const props = defineProps({
  latitude: {
    type: Number,
    default: undefined
  },
  longitude: {
    type: Number,
    default: undefined
  }
})

const chartRef = ref(null)
let chartInstance = null

const timeSeriesData = ref([])
const startDate = ref('2024-01-01')
const endDate = ref('2024-12-31')

const avgMoisture = computed(() => {
  if (timeSeriesData.value.length === 0) return 0
  return timeSeriesData.value.reduce((sum, d) => sum + d.soil_moisture, 0) / timeSeriesData.value.length
})

const maxMoisture = computed(() => {
  if (timeSeriesData.value.length === 0) return 0
  return Math.max(...timeSeriesData.value.map(d => d.soil_moisture))
})

const minMoisture = computed(() => {
  if (timeSeriesData.value.length === 0) return 0
  return Math.min(...timeSeriesData.value.map(d => d.soil_moisture))
})

const fetchTimeSeries = async () => {
  if (props.latitude === undefined || props.longitude === undefined) return
  try {
    const response = await axios.get('/api/timeseries', {
      params: {
        latitude: props.latitude,
        longitude: props.longitude,
        start_date: startDate.value,
        end_date: endDate.value
      }
    })
    timeSeriesData.value = response.data.data
    await nextTick()
    renderChart()
  } catch (error) {
    console.error('Error fetching time series:', error)
  }
}

const renderChart = () => {
  if (!chartRef.value) return
  if (chartInstance) {
    chartInstance.dispose()
  }
  chartInstance = echarts.init(chartRef.value)

  const sortedData = [...timeSeriesData.value].sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  )

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const data = params[0]
        return `
          <div style="padding: 8px;">
            <div>${data.axisValue}</div>
            <div>土壤湿度: ${(data.value * 100).toFixed(1)}%</div>
          </div>
        `
      }
    },
    grid: {
      left: 50,
      right: 20,
      top: 30,
      bottom: 40
    },
    xAxis: {
      type: 'category',
      data: sortedData.map(d => {
        const date = new Date(d.timestamp)
        return `${date.getMonth() + 1}/${date.getDate()}`
      }),
      axisLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.2)'
        }
      },
      axisLabel: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 0.6,
      axisLine: {
        show: false
      },
      axisLabel: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 10,
        formatter: (value) => `${(value * 100).toFixed(0)}%`
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.05)'
        }
      }
    },
    series: [{
      type: 'line',
      data: sortedData.map(d => d.soil_moisture),
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        width: 2,
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#00d4ff' },
          { offset: 1, color: '#7c3aed' }
        ])
      },
      itemStyle: {
        color: '#00d4ff',
        borderColor: '#fff',
        borderWidth: 1
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
          { offset: 1, color: 'rgba(0, 212, 255, 0)' }
        ])
      }
    }]
  }

  chartInstance.setOption(option)
}

watch(() => [props.latitude, props.longitude], () => {
  if (props.latitude !== undefined) {
    fetchTimeSeries()
  }
})

onMounted(() => {
  const now = new Date()
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  endDate.value = now.toISOString().split('T')[0]
  startDate.value = monthAgo.toISOString().split('T')[0]

  window.addEventListener('resize', () => {
    chartInstance?.resize()
  })
})
</script>

<style scoped>
.panel {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #0f1429 0%, #1a1f3a 100%);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header h2 {
  font-size: 16px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.coords {
  font-size: 12px;
  color: #00d4ff;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.chart-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 15px;
}

.date-range {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
}

.date-input {
  flex: 1;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
}

.date-separator {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.refresh-btn {
  padding: 8px 16px;
  background: linear-gradient(135deg, #00d4ff, #7c3aed);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.refresh-btn:hover {
  opacity: 0.9;
}

.chart {
  flex: 1;
  min-height: 200px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 15px;
}

.stat-card {
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-card-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}

.stat-card-value {
  font-size: 18px;
  font-weight: 600;
  color: #00d4ff;
}
</style>
