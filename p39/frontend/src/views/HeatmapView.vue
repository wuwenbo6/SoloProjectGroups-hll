<template>
  <div class="page-container">
    <div class="flex-between mb-24">
      <h2 class="page-title">实时热力图</h2>
      <div class="controls">
        <el-button type="primary" @click="refreshHeatmap">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-switch
          v-model="autoRefresh"
          active-text="自动刷新"
          style="margin-left: 16px;"
        />
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :span="18">
        <el-card class="card-shadow">
          <div class="heatmap-container" ref="heatmapContainer">
            <div class="heatmap-canvas-wrapper" ref="heatmapWrapper">
              <canvas ref="heatmapCanvas"></canvas>
              <div class="zone-overlay">
                <div
                  v-for="zone in zones"
                  :key="zone.zone_id"
                  class="zone-rect"
                  :style="getZoneStyle(zone)"
                >
                  <span class="zone-label">{{ zone.name }}</span>
                </div>
              </div>
            </div>
            <div class="heatmap-legend">
              <div class="legend-item">
                <div class="legend-color low"></div>
                <span>低密度</span>
              </div>
              <div class="legend-item">
                <div class="legend-color medium"></div>
                <span>中等</span>
              </div>
              <div class="legend-item">
                <div class="legend-color high"></div>
                <span>高密度</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card class="card-shadow mb-24">
          <template #header>
            <span>统计信息</span>
          </template>
          <div class="stats-panel">
            <div class="stat-item">
              <div class="stat-label">总人数估算</div>
              <div class="stat-number">{{ heatmapData?.total_estimated || 0 }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">数据时间</div>
              <div class="stat-time">{{ formatTime(heatmapData?.timestamp) }}</div>
            </div>
            <el-divider />
            <div class="zone-list">
              <div
                v-for="point in heatmapData?.points || []"
                :key="point.zone"
                class="zone-stat"
              >
                <span class="zone-name">{{ point.zone }}</span>
                <el-progress
                  :percentage="Math.round(point.value * 100)"
                  :color="getHeatColor(point.value)"
                />
              </div>
            </div>
          </div>
        </el-card>

        <el-card class="card-shadow">
          <template #header>
            <span>区域密度排名</span>
          </template>
          <el-table :data="sortedZones" size="small" show-header="false">
            <el-table-column width="50" align="center">
              <template #default="{ $index }">
                <el-tag :type="getRankType($index)" size="small">{{ $index + 1 }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="zone" />
            <el-table-column width="80" align="right">
              <template #default="{ row }">
                {{ (row.value * 100).toFixed(0) }}%
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { usePassengerStore } from '@/stores/passenger'
import { getZones } from '@/api'

const store = usePassengerStore()
const heatmapContainer = ref(null)
const heatmapWrapper = ref(null)
const heatmapCanvas = ref(null)
const autoRefresh = ref(true)
const zones = ref([])
const heatmapData = computed(() => store.heatmapData)

let refreshInterval = null
let ctx = null

const sortedZones = computed(() => {
  return [...(heatmapData.value?.points || [])].sort((a, b) => b.value - a.value)
})

const getZoneStyle = (zone) => {
  return {
    left: `${zone.x * 100}%`,
    top: `${zone.y * 100}%`,
    width: `${zone.width * 100}%`,
    height: `${zone.height * 100}%`
  }
}

const getHeatColor = (value) => {
  if (value < 0.3) return '#67c23a'
  if (value < 0.6) return '#e6a23c'
  return '#f56c6c'
}

const getRankType = (index) => {
  if (index === 0) return 'danger'
  if (index === 1) return 'warning'
  if (index === 2) return 'success'
  return 'info'
}

const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN')
}

const refreshHeatmap = async () => {
  await store.fetchHeatmap()
  await loadZones()
  drawHeatmap()
}

const loadZones = async () => {
  try {
    const res = await getZones()
    zones.value = res.data
  } catch (e) {
    console.error('Load zones error:', e)
  }
}

const drawHeatmap = () => {
  if (!heatmapCanvas.value || !heatmapData.value) return

  const canvas = heatmapCanvas.value
  const wrapper = heatmapWrapper.value
  canvas.width = wrapper.offsetWidth
  canvas.height = wrapper.offsetHeight

  ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const points = heatmapData.value.points || []

  points.forEach(point => {
    const x = point.x * canvas.width
    const y = point.y * canvas.height
    const radius = 80 + point.value * 60
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)

    const color = getHeatColor(point.value)
    const alpha = 0.3 + point.value * 0.5

    gradient.addColorStop(0, `rgba(${hexToRgb(color)}, ${alpha})`)
    gradient.addColorStop(0.5, `rgba(${hexToRgb(color)}, ${alpha * 0.5})`)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  })
}

const hexToRgb = (hex) => {
  const colors = {
    '#67c23a': '103, 194, 58',
    '#e6a23c': '230, 162, 60',
    '#f56c6c': '245, 108, 108'
  }
  return colors[hex] || '100, 100, 100'
}

watch(autoRefresh, (val) => {
  if (val) {
    refreshInterval = setInterval(refreshHeatmap, 5000)
  } else {
    if (refreshInterval) {
      clearInterval(refreshInterval)
    }
  }
})

onMounted(async () => {
  await refreshHeatmap()

  if (autoRefresh.value) {
    refreshInterval = setInterval(refreshHeatmap, 5000)
  }

  window.addEventListener('resize', drawHeatmap)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
  window.removeEventListener('resize', drawHeatmap)
})
</script>

<style lang="scss" scoped>
.heatmap-container {
  position: relative;
}

.heatmap-canvas-wrapper {
  position: relative;
  width: 100%;
  height: 500px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e7ed 100%);
  border-radius: 8px;
  overflow: hidden;

  canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
}

.zone-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.zone-rect {
  position: absolute;
  border: 2px dashed rgba(102, 126, 234, 0.5);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;

  .zone-label {
    background: rgba(102, 126, 234, 0.8);
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
  }
}

.heatmap-legend {
  display: flex;
  justify-content: center;
  gap: 32px;
  padding: 16px;

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;

    .legend-color {
      width: 24px;
      height: 16px;
      border-radius: 4px;

      &.low { background: rgba(103, 194, 58, 0.6); }
      &.medium { background: rgba(230, 162, 60, 0.6); }
      &.high { background: rgba(245, 108, 108, 0.6); }
    }
  }
}

.stats-panel {
  .stat-item {
    text-align: center;
    padding: 12px 0;

    .stat-label {
      color: #909399;
      font-size: 14px;
      margin-bottom: 8px;
    }

    .stat-number {
      font-size: 32px;
      font-weight: 700;
      color: #667eea;
    }

    .stat-time {
      font-size: 14px;
      color: #606266;
    }
  }

  .zone-list {
    .zone-stat {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;

      .zone-name {
        width: 120px;
        font-size: 13px;
      }
    }
  }
}
</style>
