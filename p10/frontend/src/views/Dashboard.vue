<template>
  <div class="dashboard">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon icon-blue">
              <el-icon size="32"><Monitor /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.total_devices || 0 }}</div>
              <div class="stat-label">设备总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon icon-green">
              <el-icon size="32"><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.online_devices || 0 }}</div>
              <div class="stat-label">在线设备</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon icon-orange">
              <el-icon size="32"><DataAnalysis /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.total_data_rows || 0 }}</div>
              <div class="stat-label">数据记录</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon icon-purple">
              <el-icon size="32"><Connection /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ activeRules }}</div>
              <div class="stat-label">运行规则</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="16">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>实时数据趋势</span>
            </div>
          </template>
          <div ref="chartRef" class="chart"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>设备状态</span>
            </div>
          </template>
          <div class="device-list">
            <div
              v-for="device in devices"
              :key="device.device_id"
              class="device-item"
            >
              <div class="device-info">
                <el-icon :class="device.online ? 'online' : 'offline'">
                  <VideoCamera />
                </el-icon>
                <span class="device-name">{{ device.name }}</span>
              </div>
              <el-tag :type="device.online ? 'success' : 'info'" size="small">
                {{ device.online ? '在线' : '离线' }}
              </el-tag>
            </div>
            <el-empty v-if="devices.length === 0" description="暂无设备" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>传感器类型分布</span>
            </div>
          </template>
          <div ref="pieChartRef" class="chart pie-chart"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { getDashboardStats, getDevices, getRules } from '@/api'

const chartRef = ref(null)
const pieChartRef = ref(null)
const stats = ref({})
const devices = ref([])
const activeRules = ref(0)

const loadStats = async () => {
  try {
    const res = await getDashboardStats()
    stats.value = res.data
  } catch (e) {
    console.error('Failed to load stats', e)
  }
}

const loadDevices = async () => {
  try {
    const res = await getDevices()
    devices.value = res.data
  } catch (e) {
    console.error('Failed to load devices', e)
  }
}

const loadRules = async () => {
  try {
    const res = await getRules()
    activeRules.value = res.data.filter(r => r.enabled).length
  } catch (e) {
    console.error('Failed to load rules', e)
  }
}

const initChart = () => {
  if (!chartRef.value) return
  
  const chart = echarts.init(chartRef.value)
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['温度', '湿度'] },
    xAxis: {
      type: 'category',
      data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00']
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: true,
        data: [22, 21, 24, 28, 30, 27, 24],
        areaStyle: { opacity: 0.3 }
      },
      {
        name: '湿度',
        type: 'line',
        smooth: true,
        data: [55, 58, 52, 48, 45, 50, 55],
        areaStyle: { opacity: 0.3 }
      }
    ]
  }
  chart.setOption(option)
  
  window.addEventListener('resize', () => chart.resize())
}

const initPieChart = () => {
  if (!pieChartRef.value) return
  
  const chart = echarts.init(pieChartRef.value)
  const option = {
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 16, fontWeight: 'bold' }
        },
        labelLine: { show: false },
        data: [
          { value: 5, name: '温度传感器' },
          { value: 3, name: '湿度传感器' },
          { value: 2, name: '开关设备' },
          { value: 1, name: '风扇' },
          { value: 1, name: '灯光' }
        ]
      }
    ]
  }
  chart.setOption(option)
  
  window.addEventListener('resize', () => chart.resize())
}

onMounted(async () => {
  await Promise.all([loadStats(), loadDevices(), loadRules()])
  await nextTick()
  initChart()
  initPieChart()
})
</script>

<style scoped>
.stat-card {
  border: none;
  border-radius: 12px;
}
.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}
.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.icon-blue { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.icon-green { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
.icon-orange { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
.icon-purple { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
.stat-info {
  flex: 1;
}
.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #333;
}
.stat-label {
  font-size: 14px;
  color: #999;
  margin-top: 4px;
}
.card-header {
  font-weight: bold;
  font-size: 16px;
}
.chart {
  height: 300px;
}
.pie-chart {
  height: 250px;
}
.device-list {
  max-height: 300px;
  overflow-y: auto;
}
.device-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #eee;
}
.device-item:last-child {
  border-bottom: none;
}
.device-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.device-name {
  font-size: 14px;
}
.online { color: #67c23a; }
.offline { color: #909399; }
</style>
