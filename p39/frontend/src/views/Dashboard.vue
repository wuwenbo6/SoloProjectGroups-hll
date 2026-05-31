<template>
  <div>
    <el-row :gutter="20" class="mb-24">
      <el-col :span="6">
        <div class="stat-card success">
          <div class="stat-label">当前估算人数</div>
          <div class="stat-value">{{ totalEstimated }}</div>
          <div class="stat-sub">置信度: {{ avgConfidence }}%</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card info">
          <div class="stat-label">原始设备数</div>
          <div class="stat-value">{{ totalRaw }}</div>
          <div class="stat-sub">MAC地址去重后</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card warning">
          <div class="stat-label">监控区域</div>
          <div class="stat-value">{{ zoneCount }}</div>
          <div class="stat-sub">区域数量</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-label">数据更新频率</div>
          <div class="stat-value">{{ updateInterval }}s</div>
          <div class="stat-sub">自动刷新</div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="card-shadow mb-24">
          <template #header>
            <div class="flex-between">
              <span>各区域客流统计</span>
              <el-button type="primary" size="small" @click="refreshData">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
          </template>
          <el-table :data="countData" border>
            <el-table-column prop="zone" label="区域" width="150" />
            <el-table-column prop="raw_count" label="原始数量" width="100" />
            <el-table-column prop="estimated_count" label="估算人数" width="120">
              <template #default="{ row }">
                <strong>{{ row.estimated_count }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="置信区间">
              <template #default="{ row }">
                [{{ row.lower_bound }}, {{ row.upper_bound }}]
              </template>
            </el-table-column>
            <el-table-column prop="confidence" label="置信度" width="100">
              <template #default="{ row }">
                <el-progress
                  :percentage="Math.round(row.confidence * 100)"
                  :color="getConfidenceColor(row.confidence)"
                  :stroke-width="10"
                />
              </template>
            </el-table-column>
            <el-table-column prop="timestamp" label="更新时间" width="180">
              <template #default="{ row }">
                {{ formatTime(row.timestamp) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card class="card-shadow">
          <template #header>
            <span>快速热力预览</span>
          </template>
          <div ref="miniChartRef" style="width: 100%; height: 300px;"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { usePassengerStore } from '@/stores/passenger'
import * as echarts from 'echarts'

const store = usePassengerStore()
const miniChartRef = ref(null)
let miniChart = null
let refreshInterval = null
const updateInterval = ref(30)

const countData = computed(() => store.currentCount)

const totalEstimated = computed(() => {
  return countData.value.reduce((sum, item) => sum + item.estimated_count, 0).toFixed(1)
})

const totalRaw = computed(() => {
  return countData.value.reduce((sum, item) => sum + item.raw_count, 0)
})

const avgConfidence = computed(() => {
  if (countData.value.length === 0) return '0.0'
  const avg = countData.value.reduce((sum, item) => sum + item.confidence, 0) / countData.value.length
  return (avg * 100).toFixed(1)
})

const zoneCount = computed(() => countData.value.length || 1)

const getConfidenceColor = (confidence) => {
  if (confidence >= 0.8) return '#67c23a'
  if (confidence >= 0.6) return '#e6a23c'
  return '#f56c6c'
}

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleString('zh-CN')
}

const refreshData = async () => {
  await store.fetchCurrentCount()
  updateMiniChart()
}

const updateMiniChart = () => {
  if (!miniChart) return

  const zones = countData.value.map(item => item.zone)
  const values = countData.value.map(item => item.estimated_count)

  miniChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: zones,
      axisLabel: { rotate: 30 }
    },
    yAxis: {
      type: 'value',
      name: '人数'
    },
    series: [{
      type: 'bar',
      data: values,
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#667eea' },
          { offset: 1, color: '#764ba2' }
        ])
      },
      barWidth: '50%'
    }]
  })
}

onMounted(() => {
  refreshData()

  if (miniChartRef.value) {
    miniChart = echarts.init(miniChartRef.value)
    updateMiniChart()
  }

  refreshInterval = setInterval(refreshData, 30000)

  window.addEventListener('resize', () => {
    miniChart?.resize()
  })
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
  miniChart?.dispose()
})
</script>
