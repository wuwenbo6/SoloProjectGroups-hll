<template>
  <div class="dashboard">
    <h2 class="page-title">数据概览</h2>
    
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #409EFF">
              <el-icon :size="28"><User /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totalPatients }}</div>
              <div class="stat-label">患者总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #67C23A">
              <el-icon :size="28"><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totalReports }}</div>
              <div class="stat-label">报告总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #E6A23C">
              <el-icon :size="28"><DataAnalysis /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.avgQuality }}%</div>
              <div class="stat-label">平均步态质量</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #F56C6C">
              <el-icon :size="28"><Warning /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.pendingReview }}</div>
              <div class="stat-label">待审核报告</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <span>本周步态分析趋势</span>
          </template>
          <div ref="trendChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <span>步态相位分布</span>
          </template>
          <div ref="phaseChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="recent-row">
      <el-col :span="24">
        <el-card class="recent-card">
          <template #header>
            <div class="card-header">
              <span>最新患者数据</span>
              <el-button type="primary" size="small" @click="$router.push('/patients')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recentPatients" stripe>
            <el-table-column prop="name" label="患者姓名" width="120" />
            <el-table-column prop="lastSession" label="最近检测" width="180" />
            <el-table-column prop="totalSteps" label="总步数" width="100" />
            <el-table-column prop="avgStanceTime" label="平均支撑相(ms)" width="150" />
            <el-table-column prop="asymmetryIndex" label="不对称指数" width="120">
              <template #default="{ row }">
                <el-tag :type="row.asymmetryIndex > 10 ? 'danger' : 'success'">
                  {{ row.asymmetryIndex }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="viewReport(row)">查看报告</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'

const router = useRouter()
const trendChart = ref(null)
const phaseChart = ref(null)

const stats = ref({
  totalPatients: 24,
  totalReports: 156,
  avgQuality: 78,
  pendingReview: 8
})

const recentPatients = ref([
  { name: '患者A', lastSession: '2024-01-15 14:30', totalSteps: 1250, avgStanceTime: 680, asymmetryIndex: 8.5 },
  { name: '患者B', lastSession: '2024-01-15 10:15', totalSteps: 980, avgStanceTime: 720, asymmetryIndex: 12.3 },
  { name: '患者C', lastSession: '2024-01-14 16:45', totalSteps: 1520, avgStanceTime: 650, asymmetryIndex: 5.2 },
  { name: '患者D', lastSession: '2024-01-14 09:00', totalSteps: 890, avgStanceTime: 780, asymmetryIndex: 15.8 },
  { name: '患者E', lastSession: '2024-01-13 15:20', totalSteps: 1100, avgStanceTime: 695, asymmetryIndex: 7.1 }
])

const initTrendChart = () => {
  const chart = echarts.init(trendChart.value)
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['检测次数', '平均质量'] },
    xAxis: {
      type: 'category',
      data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    },
    yAxis: [
      { type: 'value', name: '检测次数' },
      { type: 'value', name: '质量分数', min: 0, max: 100 }
    ],
    series: [
      {
        name: '检测次数',
        type: 'bar',
        data: [12, 18, 15, 22, 20, 8, 5],
        itemStyle: { color: '#409EFF' }
      },
      {
        name: '平均质量',
        type: 'line',
        yAxisIndex: 1,
        data: [75, 78, 72, 80, 77, 82, 79],
        itemStyle: { color: '#67C23A' },
        smooth: true
      }
    ]
  }
  chart.setOption(option)
}

const initPhaseChart = () => {
  const chart = echarts.init(phaseChart.value)
  const option = {
    tooltip: { trigger: 'item' },
    legend: { bottom: '5%', left: 'center' },
    series: [
      {
        name: '步态相位',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 16, fontWeight: 'bold' }
        },
        data: [
          { value: 62, name: '支撑相正常', itemStyle: { color: '#67C23A' } },
          { value: 18, name: '支撑相异常', itemStyle: { color: '#E6A23C' } },
          { value: 15, name: '摆动相正常', itemStyle: { color: '#409EFF' } },
          { value: 5, name: '摆动相异常', itemStyle: { color: '#F56C6C' } }
        ]
      }
    ]
  }
  chart.setOption(option)
}

const viewReport = (row) => {
  router.push('/reports')
}

onMounted(() => {
  initTrendChart()
  initPhaseChart()
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 20px;
  color: #303133;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
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
  color: white;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

.charts-row {
  margin-bottom: 20px;
}

.chart-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.chart-container {
  height: 300px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.recent-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}
</style>
