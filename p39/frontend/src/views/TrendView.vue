<template>
  <div class="page-container">
    <div class="flex-between mb-24">
      <h2 class="page-title">客流趋势预测</h2>
      <div class="controls">
        <el-select v-model="selectedZone" placeholder="选择区域" style="width: 200px; margin-right: 16px;">
          <el-option
            v-for="zone in zones"
            :key="zone.zone_id"
            :label="zone.name"
            :value="zone.zone_id"
          />
          <el-option v-if="zones.length === 0" label="默认区域" value="default" />
        </el-select>
        <el-button type="primary" @click="refreshTrend">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :span="24">
        <el-card class="card-shadow mb-24">
          <template #header>
            <span>客流趋势图</span>
          </template>
          <div ref="trendChartRef" style="width: 100%; height: 400px;"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="card-shadow">
          <template #header>
            <span>预测数据</span>
          </template>
          <el-table :data="predictedData" size="small">
            <el-table-column label="时间" width="150">
              <template #default="{ row }">
                {{ formatTime(row.timestamp) }}
              </template>
            </el-table-column>
            <el-table-column prop="count" label="预测人数" align="right" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="card-shadow">
          <template #header>
            <span>历史峰值</span>
          </template>
          <div class="peak-stats">
            <div class="peak-item">
              <div class="peak-label">今日最高</div>
              <div class="peak-value">{{ todayMax }}</div>
            </div>
            <div class="peak-item">
              <div class="peak-label">历史平均</div>
              <div class="peak-value">{{ historyAvg }}</div>
            </div>
            <div class="peak-item">
              <div class="peak-label">当前趋势</div>
              <div class="peak-value" :class="trendDirection > 0 ? 'up' : 'down'">
                <el-icon v-if="trendDirection > 0"><Top /></el-icon>
                <el-icon v-else><Bottom /></el-icon>
                {{ Math.abs(trendDirection).toFixed(1) }}%
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="card-shadow">
          <template #header>
            <span>客流建议</span>
          </template>
          <div class="suggestions">
            <el-alert
              v-for="(suggestion, index) in suggestions"
              :key="index"
              :title="suggestion.title"
              :type="suggestion.type"
              :description="suggestion.desc"
              show-icon
              style="margin-bottom: 12px;"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { usePassengerStore } from '@/stores/passenger'
import { getZones } from '@/api'
import * as echarts from 'echarts'

const store = usePassengerStore()
const trendChartRef = ref(null)
const selectedZone = ref('default')
const zones = ref([])
let trendChart = null

const trendData = computed(() => store.trendData)

const predictedData = computed(() => trendData.value?.predicted || [])
const historicalData = computed(() => trendData.value?.historical || [])

const todayMax = computed(() => {
  const all = [...historicalData.value, ...predictedData.value]
  return all.length > 0 ? Math.max(...all.map(d => d.count)).toFixed(1) : '0'
})

const historyAvg = computed(() => {
  if (historicalData.value.length === 0) return '0'
  const sum = historicalData.value.reduce((acc, d) => acc + d.count, 0)
  return (sum / historicalData.value.length).toFixed(1)
})

const trendDirection = computed(() => {
  if (predictedData.value.length < 2) return 0
  const first = predictedData.value[0].count
  const last = predictedData.value[predictedData.value.length - 1].count
  if (first === 0) return 0
  return ((last - first) / first) * 100
})

const suggestions = computed(() => {
  const result = []
  const currentPred = predictedData.value[predictedData.value.length - 1]?.count || 0

  if (currentPred > 50) {
    result.push({
      title: '客流高峰预警',
      type: 'warning',
      desc: '预计未来1小时内客流将达到较高水平，建议增加工作人员。'
    })
  }

  if (trendDirection.value > 10) {
    result.push({
      title: '客流上升趋势',
      type: 'info',
      desc: '客流呈上升趋势，请注意疏导。'
    })
  } else if (trendDirection.value < -10) {
    result.push({
      title: '客流下降趋势',
      type: 'info',
      desc: '客流呈下降趋势，可以适当调整服务配置。'
    })
  }

  if (result.length === 0) {
    result.push({
      title: '客流平稳',
      type: 'success',
      desc: '当前客流状态平稳，无需特殊处理。'
    })
  }

  return result
})

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const loadZones = async () => {
  try {
    const res = await getZones()
    zones.value = res.data
    if (res.data.length > 0 && selectedZone.value === 'default') {
      selectedZone.value = res.data[0].zone_id
    }
  } catch (e) {
    console.error('Load zones error:', e)
  }
}

const refreshTrend = async () => {
  await store.fetchTrend(selectedZone.value, 12)
  updateTrendChart()
}

const updateTrendChart = () => {
  if (!trendChart || !trendData.value) return

  const historicalTimes = historicalData.value.map(d => formatTime(d.timestamp))
  const historicalValues = historicalData.value.map(d => d.count)
  const predictedTimes = predictedData.value.map(d => formatTime(d.timestamp))
  const predictedValues = predictedData.value.map(d => d.count)

  trendChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: ['历史数据', '预测数据']
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: [...historicalTimes, ...predictedTimes]
    },
    yAxis: {
      type: 'value',
      name: '人数'
    },
    series: [
      {
        name: '历史数据',
        type: 'line',
        data: historicalValues,
        smooth: true,
        lineStyle: { color: '#667eea', width: 3 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(102, 126, 234, 0.3)' },
            { offset: 1, color: 'rgba(102, 126, 234, 0.05)' }
          ])
        }
      },
      {
        name: '预测数据',
        type: 'line',
        data: [...new Array(historicalValues.length - 1).fill(null), historicalValues[historicalValues.length - 1], ...predictedValues],
        smooth: true,
        lineStyle: { color: '#f56c6c', width: 2, type: 'dashed' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(245, 108, 108, 0.2)' },
            { offset: 1, color: 'rgba(245, 108, 108, 0.02)' }
          ])
        }
      }
    ]
  })
}

onMounted(async () => {
  await loadZones()
  await refreshTrend()

  if (trendChartRef.value) {
    trendChart = echarts.init(trendChartRef.value)
    updateTrendChart()
  }

  window.addEventListener('resize', () => {
    trendChart?.resize()
  })
})

onUnmounted(() => {
  trendChart?.dispose()
})
</script>

<style lang="scss" scoped>
.peak-stats {
  .peak-item {
    padding: 16px 0;
    text-align: center;
    border-bottom: 1px solid #ebeef5;

    &:last-child {
      border-bottom: none;
    }

    .peak-label {
      color: #909399;
      font-size: 14px;
      margin-bottom: 8px;
    }

    .peak-value {
      font-size: 28px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;

      &.up {
        color: #f56c6c;
      }

      &.down {
        color: #67c23a;
      }
    }
  }
}

.suggestions {
  max-height: 300px;
  overflow-y: auto;
}
</style>
