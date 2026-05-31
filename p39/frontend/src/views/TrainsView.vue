<template>
  <div class="page-container">
    <div class="flex-between mb-24">
      <h2 class="page-title">车次联动管理</h2>
      <el-button type="primary" @click="refreshData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <el-row :gutter="20">
      <el-col :span="24">
        <el-card class="card-shadow mb-24">
          <template #header>
            <div class="flex-between">
              <span>客流预测（车次联动）</span>
              <el-select v-model="forecastMinutes" style="width: 150px;" @change="refreshData">
                <el-option label="未来30分钟" :value="30" />
                <el-option label="未来60分钟" :value="60" />
                <el-option label="未来120分钟" :value="120" />
              </el-select>
            </div>
          </template>
          <el-row :gutter="20">
            <el-col :span="8">
              <div class="forecast-stat">
                <div class="stat-label">即将发车车次</div>
                <div class="stat-value">{{ trainForecast?.departing_trains_count || 0 }}</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="forecast-stat">
                <div class="stat-label">预计总客流量</div>
                <div class="stat-value">{{ trainForecast?.estimated_total_passengers || 0 }}</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="forecast-stat">
                <div class="stat-label">峰值客流预估</div>
                <div class="stat-value">{{ trainForecast?.peak_load_estimate || 0 }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="card-shadow mb-24">
          <template #header>
            <span>座位占用情况</span>
          </template>
          <div class="seat-occupancy">
            <div class="seat-gauge">
              <el-progress
                type="dashboard"
                :percentage="seatOccupancy?.occupancy_rate || 0"
                :color="getOccupancyColor(seatOccupancy?.status)"
                :width="180"
              />
              <div class="seat-status" :class="seatOccupancy?.status">
                {{ getStatusText(seatOccupancy?.status) }}
              </div>
            </div>
            <el-divider />
            <el-row :gutter="16">
              <el-col :span="12">
                <div class="seat-item">
                  <div class="item-label">总座位数</div>
                  <div class="item-value">{{ seatOccupancy?.total_seats || 0 }}</div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="seat-item">
                  <div class="item-label">预估就坐</div>
                  <div class="item-value">{{ seatOccupancy?.estimated_seated || 0 }}</div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="seat-item">
                  <div class="item-label">站立客流</div>
                  <div class="item-value">{{ seatOccupancy?.standing_devices || 0 }}</div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="seat-item">
                  <div class="item-label">平均停留</div>
                  <div class="item-value">{{ seatOccupancy?.avg_stay_minutes || 0 }}分钟</div>
                </div>
              </el-col>
            </el-row>
          </div>
        </el-card>

        <el-card class="card-shadow">
          <template #header>
            <span>停留时长分布</span>
          </template>
          <div ref="stayChartRef" style="width: 100%; height: 250px;"></div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card class="card-shadow">
          <template #header>
            <span>即将发车车次</span>
          </template>
          <el-table :data="departingTrains" size="small">
            <el-table-column prop="train_number" label="车次" width="100">
              <template #default="{ row }">
                <el-tag type="primary" size="small">{{ row.train_number }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="arrival_station" label="目的地" />
            <el-table-column label="发车时间" width="120">
              <template #default="{ row }">
                {{ formatTime(row.scheduled_departure) }}
              </template>
            </el-table-column>
            <el-table-column prop="platform" label="站台" width="80" align="center" />
            <el-table-column prop="gate" label="检票口" width="80" align="center" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" size="small">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mt-24">
      <el-col :span="24">
        <el-card class="card-shadow">
          <template #header>
            <span>全部车次时刻表</span>
          </template>
          <el-table :data="allSchedules" border stripe>
            <el-table-column prop="train_number" label="车次" width="100" fixed>
              <template #default="{ row }">
                <el-tag type="primary" size="small">{{ row.train_number }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="departure_station" label="发站" width="100" />
            <el-table-column prop="arrival_station" label="到站" width="100" />
            <el-table-column label="发车时间" width="120">
              <template #default="{ row }">
                {{ formatTime(row.scheduled_departure) }}
              </template>
            </el-table-column>
            <el-table-column label="到达时间" width="120">
              <template #default="{ row }">
                {{ formatTime(row.scheduled_arrival) }}
              </template>
            </el-table-column>
            <el-table-column prop="platform" label="站台" width="80" align="center" />
            <el-table-column prop="gate" label="检票口" width="80" align="center" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" size="small">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getSeatOccupancy, getStayDistribution,
  getTrainSchedules, getDepartingTrains, getTrainForecast
} from '@/api'
import * as echarts from 'echarts'

const forecastMinutes = ref(60)
const seatOccupancy = ref(null)
const stayDistribution = ref({})
const allSchedules = ref([])
const departingTrains = ref([])
const trainForecast = ref(null)
const stayChartRef = ref(null)
let stayChart = null
let refreshInterval = null

const getOccupancyColor = (status) => {
  const colors = {
    low: '#67c23a',
    medium: '#e6a23c',
    high: '#f56c6c',
    critical: '#f56c6c'
  }
  return colors[status] || '#909399'
}

const getStatusText = (status) => {
  const texts = {
    low: '空闲',
    medium: '适中',
    high: '拥挤',
    critical: '非常拥挤',
    scheduled: '待发车',
    boarding: '检票中',
    departed: '已发车',
    delayed: '延误'
  }
  return texts[status] || status
}

const getStatusType = (status) => {
  const types = {
    boarding: 'warning',
    scheduled: 'success',
    departed: 'info',
    delayed: 'danger'
  }
  return types[status] || 'info'
}

const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const refreshData = async () => {
  try {
    const [seatRes, stayRes, scheduleRes, departingRes, forecastRes] = await Promise.all([
      getSeatOccupancy('default'),
      getStayDistribution('default'),
      getTrainSchedules(),
      getDepartingTrains(forecastMinutes.value),
      getTrainForecast('default', forecastMinutes.value)
    ])

    seatOccupancy.value = seatRes.data
    stayDistribution.value = stayRes.data
    allSchedules.value = scheduleRes.data
    departingTrains.value = departingRes.data
    trainForecast.value = forecastRes.data

    updateStayChart()
  } catch (e) {
    ElMessage.error('刷新数据失败')
    console.error(e)
  }
}

const updateStayChart = () => {
  if (!stayChart || !stayDistribution.value) return

  const labels = ['0-5分钟', '5-15分钟', '15-30分钟', '30-60分钟', '60分钟以上']
  const keys = ['0-5min', '5-15min', '15-30min', '30-60min', '60min+']
  const values = keys.map(k => stayDistribution.value[k] || 0)

  stayChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: labels },
    yAxis: { type: 'value', name: '人数' },
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

onMounted(async () => {
  await refreshData()

  if (stayChartRef.value) {
    stayChart = echarts.init(stayChartRef.value)
    updateStayChart()
  }

  refreshInterval = setInterval(refreshData, 30000)

  window.addEventListener('resize', () => stayChart?.resize())
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
  stayChart?.dispose()
})
</script>

<style lang="scss" scoped>
.forecast-stat {
  text-align: center;
  padding: 20px;

  .stat-label {
    color: #909399;
    font-size: 14px;
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 36px;
    font-weight: 700;
    color: #667eea;
  }
}

.seat-occupancy {
  .seat-gauge {
    text-align: center;
    position: relative;

    .seat-status {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 18px;
      font-weight: 600;

      &.low { color: #67c23a; }
      &.medium { color: #e6a23c; }
      &.high, &.critical { color: #f56c6c; }
    }
  }

  .seat-item {
    text-align: center;
    padding: 12px 0;

    .item-label {
      color: #909399;
      font-size: 13px;
      margin-bottom: 4px;
    }

    .item-value {
      font-size: 20px;
      font-weight: 600;
      color: #303133;
    }
  }
}

.mt-24 {
  margin-top: 24px;
}
</style>
