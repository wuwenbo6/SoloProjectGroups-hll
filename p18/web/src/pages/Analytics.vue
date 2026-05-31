<template>
  <div class="analytics">
    <h2 class="page-title">数据分析</h2>

    <el-card class="filter-card">
      <el-form :inline="true" :model="filterForm">
        <el-form-item label="患者">
          <el-select v-model="filterForm.patientId" placeholder="全部患者" clearable style="width: 150px">
            <el-option v-for="p in patients" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="filterForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="applyFilter">应用筛选</el-button>
          <el-button @click="exportData">导出数据</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-row :gutter="20" class="summary-row">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-label">总检测次数</div>
          <div class="stat-value">{{ summary.totalSessions }}</div>
          <div class="stat-trend up">↑ 12.5%</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-label">平均不对称指数</div>
          <div class="stat-value">{{ summary.avgAsymmetry }}</div>
          <div class="stat-trend down">↓ 3.2%</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-label">平均支撑相时间</div>
          <div class="stat-value">{{ summary.avgStanceTime }} ms</div>
          <div class="stat-trend up">↑ 1.8%</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-label">步态改善率</div>
          <div class="stat-value">{{ summary.improvementRate }}%</div>
          <div class="stat-trend up">↑ 8.3%</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <span>不对称指数趋势</span>
          </template>
          <div ref="asymmetryChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <span>支撑相/摆动相时间对比</span>
          </template>
          <div ref="phaseCompareChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="24">
        <el-card class="chart-card">
          <template #header>
            <span>患者步态质量对比</span>
          </template>
          <div ref="patientCompareChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <span>步态状态分布</span>
          </template>
          <div ref="statusDistChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <span>年龄分布分析</span>
          </template>
          <div ref="ageDistChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'

const filterForm = ref({
  patientId: '',
  dateRange: []
})

const patients = ref([
  { id: 'P001', name: '张三' },
  { id: 'P002', name: '李四' },
  { id: 'P003', name: '王五' },
  { id: 'P004', name: '赵六' }
])

const summary = ref({
  totalSessions: 156,
  avgAsymmetry: 9.2,
  avgStanceTime: 695,
  improvementRate: 67.8
})

const asymmetryChart = ref(null)
const phaseCompareChart = ref(null)
const patientCompareChart = ref(null)
const statusDistChart = ref(null)
const ageDistChart = ref(null)

const initAsymmetryChart = () => {
  const chart = echarts.init(asymmetryChart.value)
  const months = ['1月', '2月', '3月', '4月', '5月', '6月']
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['平均不对称指数', '阈值线'] },
    xAxis: { type: 'category', data: months },
    yAxis: { type: 'value', name: '不对称指数', min: 0, max: 20 },
    series: [
      {
        name: '平均不对称指数',
        type: 'line',
        data: [12.5, 11.8, 10.5, 9.8, 9.2, 8.5],
        smooth: true,
        lineStyle: { color: '#409EFF', width: 3 },
        itemStyle: { color: '#409EFF' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(64, 158, 255, 0.4)' },
            { offset: 1, color: 'rgba(64, 158, 255, 0.05)' }
          ])
        }
      },
      {
        name: '阈值线',
        type: 'line',
        data: [10, 10, 10, 10, 10, 10],
        lineStyle: { color: '#F56C6C', type: 'dashed' },
        symbol: 'none'
      }
    ]
  }
  chart.setOption(option)
}

const initPhaseCompareChart = () => {
  const chart = echarts.init(phaseCompareChart.value)
  const sessions = ['第1次', '第2次', '第3次', '第4次', '第5次', '第6次']
  const option = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['支撑相', '摆动相'] },
    xAxis: { type: 'category', data: sessions },
    yAxis: { type: 'value', name: '时间 (ms)' },
    series: [
      {
        name: '支撑相',
        type: 'bar',
        data: [720, 710, 700, 695, 690, 680],
        itemStyle: { color: '#409EFF' }
      },
      {
        name: '摆动相',
        type: 'bar',
        data: [380, 375, 365, 360, 355, 350],
        itemStyle: { color: '#67C23A' }
      }
    ]
  }
  chart.setOption(option)
}

const initPatientCompareChart = () => {
  const chart = echarts.init(patientCompareChart.value)
  const option = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['不对称指数', '步态质量评分'] },
    xAxis: { type: 'category', data: ['张三', '李四', '王五', '赵六', '钱七', '孙八'] },
    yAxis: [
      { type: 'value', name: '不对称指数', min: 0, max: 20 },
      { type: 'value', name: '质量评分', min: 0, max: 100 }
    ],
    series: [
      {
        name: '不对称指数',
        type: 'bar',
        data: [8.5, 12.3, 5.2, 15.8, 7.1, 9.8],
        itemStyle: { color: '#E6A23C' }
      },
      {
        name: '步态质量评分',
        type: 'line',
        yAxisIndex: 1,
        data: [82, 68, 92, 55, 85, 75],
        lineStyle: { color: '#409EFF', width: 3 },
        itemStyle: { color: '#409EFF' }
      }
    ]
  }
  chart.setOption(option)
}

const initStatusDistChart = () => {
  const chart = echarts.init(statusDistChart.value)
  const option = {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: '60%',
        data: [
          { value: 45, name: '正常', itemStyle: { color: '#67C23A' } },
          { value: 30, name: '轻度异常', itemStyle: { color: '#E6A23C' } },
          { value: 20, name: '中度异常', itemStyle: { color: '#F56C6C' } },
          { value: 5, name: '重度异常', itemStyle: { color: '#C0392B' } }
        ],
        label: {
          formatter: '{b}: {c}人 ({d}%)'
        }
      }
    ]
  }
  chart.setOption(option)
}

const initAgeDistChart = () => {
  const chart = echarts.init(ageDistChart.value)
  const option = {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: ['20-30岁', '31-40岁', '41-50岁', '51-60岁', '61-70岁', '70岁以上']
    },
    yAxis: { type: 'value', name: '人数' },
    series: [
      {
        type: 'bar',
        data: [3, 5, 8, 12, 18, 10],
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#409EFF' },
            { offset: 1, color: '#67C23A' }
          ])
        },
        barWidth: '50%'
      }
    ]
  }
  chart.setOption(option)
}

const applyFilter = () => {
  ElMessage.success('筛选已应用')
}

const exportData = () => {
  ElMessage.success('数据导出中...')
}

onMounted(() => {
  initAsymmetryChart()
  initPhaseCompareChart()
  initPatientCompareChart()
  initStatusDistChart()
  initAgeDistChart()
})
</script>

<style scoped>
.analytics {
  padding: 0;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 20px;
}

.filter-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  margin-bottom: 20px;
}

.summary-row {
  margin-bottom: 20px;
}

.stat-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  text-align: center;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 32px;
  font-weight: 600;
  color: #303133;
}

.stat-trend {
  font-size: 14px;
  margin-top: 8px;
}

.stat-trend.up {
  color: '#67C23A';
}

.stat-trend.down {
  color: '#F56C6C';
}

.charts-row {
  margin-bottom: 20px;
}

.chart-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.chart-container {
  height: 350px;
}
</style>
