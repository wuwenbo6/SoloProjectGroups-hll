<template>
  <div class="page-container">
    <div class="flex-between mb-24">
      <h2 class="page-title">历史数据回放</h2>
      <div class="controls">
        <el-date-picker
          v-model="playbackDate"
          type="date"
          placeholder="选择日期"
          style="margin-right: 16px;"
        />
        <el-select v-model="selectedZone" placeholder="选择区域" style="width: 200px; margin-right: 16px;">
          <el-option label="默认区域" value="default" />
        </el-select>
      </div>
    </div>

    <el-card class="card-shadow mb-24">
      <template #header>
        <span>回放控制</span>
      </template>
      <div class="playback-controls">
        <el-button-group>
          <el-button @click="stepBackward">
            <el-icon><DArrowLeft /></el-icon>
          </el-button>
          <el-button @click="togglePlayback">
            <el-icon v-if="!isPlaying"><VideoPlay /></el-icon>
            <el-icon v-else><VideoPause /></el-icon>
          </el-button>
          <el-button @click="stepForward">
            <el-icon><DArrowRight /></el-icon>
          </el-button>
          <el-button @click="resetPlayback">
            <el-icon><RefreshLeft /></el-icon>
          </el-button>
        </el-button-group>

        <div class="slider-wrapper">
          <el-slider
            v-model="playbackIndex"
            :min="0"
            :max="historyData.length - 1"
            :step="1"
            :show-tooltip="false"
            style="flex: 1; margin: 0 24px;"
          />
        </div>

        <el-select v-model="playbackSpeed" style="width: 120px;">
          <el-option label="0.5x" :value="0.5" />
          <el-option label="1x" :value="1" />
          <el-option label="2x" :value="2" />
          <el-option label="4x" :value="4" />
        </el-select>
      </div>

      <div class="playback-info">
        <el-tag>时间: {{ currentTime }}</el-tag>
        <el-tag type="info">进度: {{ playbackProgress }}%</el-tag>
        <el-tag type="success">数据点: {{ historyData.length }}</el-tag>
      </div>
    </el-card>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="card-shadow">
          <template #header>
            <span>回放曲线</span>
          </template>
          <div ref="playbackChartRef" style="width: 100%; height: 350px;"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="card-shadow">
          <template #header>
            <span>实时数据面板</span>
          </template>
          <div class="realtime-panel">
            <div class="realtime-item">
              <div class="item-label">估算人数</div>
              <div class="item-value big">{{ currentEstimated }}</div>
            </div>
            <el-row :gutter="16">
              <el-col :span="12">
                <div class="realtime-item">
                  <div class="item-label">原始设备数</div>
                  <div class="item-value">{{ currentRaw }}</div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="realtime-item">
                  <div class="item-label">置信度</div>
                  <div class="item-value">{{ (currentConfidence * 100).toFixed(0) }}%</div>
                </div>
              </el-col>
            </el-row>
            <el-divider />
            <div class="confidence-range">
              <div class="range-label">置信区间</div>
              <div class="range-bars">
                <div class="range-bar lower">
                  <span class="bar-value">{{ currentLower }}</span>
                  <span class="bar-label">下限</span>
                </div>
                <div class="range-bar upper">
                  <span class="bar-value">{{ currentUpper }}</span>
                  <span class="bar-label">上限</span>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { getCountHistory } from '@/api'
import * as echarts from 'echarts'

const playbackDate = ref(new Date())
const selectedZone = ref('default')
const playbackIndex = ref(0)
const isPlaying = ref(false)
const playbackSpeed = ref(1)
const playbackChartRef = ref(null)
const historyData = ref([])

let playbackChart = null
let playbackInterval = null

const currentData = computed(() => historyData.value[playbackIndex.value] || {})

const currentTime = computed(() => {
  if (!currentData.value.timestamp) return '-'
  return new Date(currentData.value.timestamp).toLocaleString('zh-CN')
})

const currentEstimated = computed(() => currentData.value.estimated_count || 0)
const currentRaw = computed(() => currentData.value.raw_count || 0)
const currentConfidence = computed(() => currentData.value.confidence || 0)
const currentLower = computed(() => currentData.value.lower_bound || 0)
const currentUpper = computed(() => currentData.value.upper_bound || 0)

const playbackProgress = computed(() => {
  if (historyData.value.length <= 1) return 0
  return ((playbackIndex.value / (historyData.value.length - 1)) * 100).toFixed(1)
})

const loadHistoryData = async () => {
  try {
    const start = new Date(playbackDate.value)
    start.setHours(0, 0, 0, 0)
    const end = new Date(playbackDate.value)
    end.setHours(23, 59, 59, 999)

    const res = await getCountHistory({
      zone: selectedZone.value,
      start_time: start.toISOString(),
      end_time: end.toISOString()
    })

    historyData.value = res.data
    playbackIndex.value = 0
    updatePlaybackChart()
  } catch (e) {
    console.error('Load history error:', e)
  }
}

const updatePlaybackChart = () => {
  if (!playbackChart) return

  const times = historyData.value.map(d =>
    new Date(d.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  )
  const values = historyData.value.map(d => d.estimated_count)

  playbackChart.setOption({
    tooltip: {
      trigger: 'axis'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: times
    },
    yAxis: {
      type: 'value',
      name: '人数'
    },
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        lineStyle: { color: '#667eea', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(102, 126, 234, 0.3)' },
            { offset: 1, color: 'rgba(102, 126, 234, 0.05)' }
          ])
        },
        markPoint: {
          data: playbackIndex.value >= 0 ? [{
            coord: [playbackIndex.value, values[playbackIndex.value]],
            symbol: 'circle',
            symbolSize: 12,
            itemStyle: { color: '#f56c6c' }
          }] : []
        }
      }
    ]
  })
}

const togglePlayback = () => {
  isPlaying.value = !isPlaying.value

  if (isPlaying.value) {
    playbackInterval = setInterval(() => {
      if (playbackIndex.value < historyData.value.length - 1) {
        playbackIndex.value++
        updatePlaybackChart()
      } else {
        isPlaying.value = false
        clearInterval(playbackInterval)
      }
    }, 1000 / playbackSpeed.value)
  } else {
    if (playbackInterval) {
      clearInterval(playbackInterval)
    }
  }
}

const stepBackward = () => {
  if (playbackIndex.value > 0) {
    playbackIndex.value--
    updatePlaybackChart()
  }
}

const stepForward = () => {
  if (playbackIndex.value < historyData.value.length - 1) {
    playbackIndex.value++
    updatePlaybackChart()
  }
}

const resetPlayback = () => {
  playbackIndex.value = 0
  isPlaying.value = false
  if (playbackInterval) {
    clearInterval(playbackInterval)
  }
  updatePlaybackChart()
}

watch(playbackSpeed, () => {
  if (isPlaying.value) {
    clearInterval(playbackInterval)
    playbackInterval = setInterval(() => {
      if (playbackIndex.value < historyData.value.length - 1) {
        playbackIndex.value++
        updatePlaybackChart()
      } else {
        isPlaying.value = false
        clearInterval(playbackInterval)
      }
    }, 1000 / playbackSpeed.value)
  }
})

watch(playbackIndex, updatePlaybackChart)

onMounted(async () => {
  await loadHistoryData()

  if (playbackChartRef.value) {
    playbackChart = echarts.init(playbackChartRef.value)
    updatePlaybackChart()
  }

  window.addEventListener('resize', () => {
    playbackChart?.resize()
  })
})

onUnmounted(() => {
  if (playbackInterval) {
    clearInterval(playbackInterval)
  }
  playbackChart?.dispose()
})
</script>

<style lang="scss" scoped>
.playback-controls {
  display: flex;
  align-items: center;
  margin-bottom: 16px;

  .slider-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
  }
}

.playback-info {
  display: flex;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.realtime-panel {
  .realtime-item {
    text-align: center;
    padding: 16px 0;

    .item-label {
      color: #909399;
      font-size: 14px;
      margin-bottom: 8px;
    }

    .item-value {
      font-size: 24px;
      font-weight: 700;
      color: #667eea;

      &.big {
        font-size: 48px;
      }
    }
  }

  .confidence-range {
    .range-label {
      text-align: center;
      color: #909399;
      margin-bottom: 12px;
    }

    .range-bars {
      display: flex;
      justify-content: space-around;

      .range-bar {
        text-align: center;

        .bar-value {
          display: block;
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .bar-label {
          color: #909399;
          font-size: 12px;
        }

        &.lower .bar-value { color: #67c23a; }
        &.upper .bar-value { color: #f56c6c; }
      }
    }
  }
}
</style>
