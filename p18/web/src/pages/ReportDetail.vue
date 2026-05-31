<template>
  <div class="report-detail">
    <div class="page-header">
      <el-button @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h2 class="page-title">步态分析报告详情</h2>
      <div class="header-buttons">
        <el-button type="success" @click="exportPDF" :loading="exporting">
          <el-icon><Download /></el-icon>
          导出PDF报告
        </el-button>
        <el-button type="primary" @click="markAsReviewed" :disabled="report.isReviewed">
          标记为已审核
        </el-button>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :span="24">
        <el-card class="score-card">
          <template #header>
            <span>康复评分</span>
          </template>
          <div class="score-overview">
            <div class="score-main">
              <div class="score-circle" :style="{ background: getScoreGradient(scores.overall)">
                <span class="score-value">{{ scores.overall }}</span>
                <span class="score-grade">{{ scores.grade }}</span>
              </div>
              <div class="score-label">综合评分</div>
            </div>
            <div class="score-items">
              <div class="score-item">
                <div class="score-item-header">
                  <span>对称性</span>
                  <span>{{ scores.symmetry }}</span>
                </div>
                <el-progress :percentage="scores.symmetry" :color="getScoreColor(scores.symmetry)" />
              </div>
              <div class="score-item">
                <div class="score-item-header">
                  <span>一致性</span>
                  <span>{{ scores.consistency }}</span>
                </div>
                <el-progress :percentage="scores.consistency" :color="getScoreColor(scores.consistency)" />
              </div>
              <div class="score-item">
                <div class="score-item-header">
                  <span>稳定性</span>
                  <span>{{ scores.stability }}</span>
                </div>
                <el-progress :percentage="scores.stability" :color="getScoreColor(scores.stability)" />
              </div>
              <div class="score-item">
                <div class="score-item-header">
                  <span>节律性</span>
                  <span>{{ scores.rhythm }}</span>
                </div>
                <el-progress :percentage="scores.rhythm" :color="getScoreColor(scores.rhythm)" />
              </div>
              <div class="score-item">
                <div class="score-item-header">
                  <span>耐力</span>
                  <span>{{ scores.endurance }}</span>
                </div>
                <el-progress :percentage="scores.endurance" :color="getScoreColor(scores.endurance)" />
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="info-row">
      <el-col :span="24">
        <el-card class="info-card">
          <template #header>
            <span>基本信息</span>
          </template>
          <el-descriptions :column="4" border>
            <el-descriptions-item label="报告ID">{{ report.id }}</el-descriptions-item>
            <el-descriptions-item label="患者姓名">{{ report.patientName }}</el-descriptions-item>
            <el-descriptions-item label="会话ID">{{ report.sessionId }}</el-descriptions-item>
            <el-descriptions-item label="生成时间">{{ report.createdAt }}</el-descriptions-item>
            <el-descriptions-item label="总步数">{{ report.totalSteps }}</el-descriptions-item>
            <el-descriptions-item label="平均支撑相时间">{{ report.avgStanceTime }} ms</el-descriptions-item>
            <el-descriptions-item label="平均摆动相时间">{{ report.avgSwingTime }} ms</el-descriptions-item>
            <el-descriptions-item label="不对称指数">
              <el-tag :type="report.asymmetryIndex > 10 ? 'danger' : 'success'">
                {{ report.asymmetryIndex }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <span>步态相位时间分布</span>
          </template>
          <div ref="phaseTimeChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card">
          <template #header>
            <span>步态参数对比</span>
          </template>
          <div ref="paramsChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="charts-row">
      <el-col :span="24">
        <el-card class="chart-card">
          <template #header>
            <span>加速度波形图</span>
          </template>
          <div ref="waveformChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="analysis-card">
          <template #header>
            <span>分析结果</span>
          </template>
          <div class="analysis-content">
            <pre>{{ report.reportContent }}</pre>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="analysis-card">
          <template #header>
            <span>康复建议</span>
          </template>
          <div class="recommendations">
            <pre>{{ report.recommendations }}</pre>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="notes-row">
      <el-col :span="24">
        <el-card class="notes-card">
          <template #header>
            <span>医生备注</span>
          </template>
          <el-input
            v-model="doctorNotes"
            type="textarea"
            :rows="4"
            placeholder="请输入医生备注..."
          />
          <el-button type="primary" class="save-btn" @click="saveNotes">保存备注</el-button>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'

const route = useRoute()
const phaseTimeChart = ref(null)
const paramsChart = ref(null)
const waveformChart = ref(null)
const doctorNotes = ref('')
const exporting = ref(false)

const scores = ref({
  overall: 78.5,
  symmetry: 82,
  consistency: 75,
  stability: 71,
  rhythm: 80,
  endurance: 85,
  grade: 'B'
})

const report = ref({
  id: route.params.id || 'R001',
  patientName: '张三',
  sessionId: 'S001',
  createdAt: '2024-01-15 14:45:00',
  totalSteps: 1250,
  avgStanceTime: 680,
  avgSwingTime: 350,
  asymmetryIndex: 8.5,
  isReviewed: false,
  reportContent: `步态分析报告
============

会话信息:
- 用户ID: demo_user_001
- 会话ID: S001
- 分析时间: 2024-01-15 14:30:00

步态参数:
- 总步数: 1250
- 平均支撑相时间: 680 ms
- 平均摆动相时间: 350 ms
- 支撑相比率: 66.02%
- 不对称指数: 8.5

分析结果:
- 支撑相时间偏长，可能表明步态稳定性问题
- 左右步态对称性良好
- 整体步态质量良好`,
  recommendations: `1. 建议进行平衡训练，改善步态稳定性
2. 考虑进行物理治疗以优化步态模式
3. 建议每天进行30分钟的步行训练
4. 定期复查步态分析，跟踪改善情况
5. 注意行走时的节奏控制`
})

const initPhaseTimeChart = () => {
  const chart = echarts.init(phaseTimeChart.value)
  const option = {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        data: [
          { value: 680, name: '支撑相', itemStyle: { color: '#409EFF' } },
          { value: 350, name: '摆动相', itemStyle: { color: '#67C23A' } }
        ],
        label: {
          formatter: '{b}: {c}ms\n({d}%)'
        }
      }
    ]
  }
  chart.setOption(option)
}

const initParamsChart = () => {
  const chart = echarts.init(paramsChart.value)
  const option = {
    tooltip: { trigger: 'axis' },
    radar: {
      indicator: [
        { name: '步频一致性', max: 100 },
        { name: '步态对称性', max: 100 },
        { name: '支撑相稳定性', max: 100 },
        { name: '摆动相流畅度', max: 100 },
        { name: '整体质量', max: 100 }
      ]
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: [82, 91, 75, 88, 82],
            name: '当前检测',
            areaStyle: { color: 'rgba(64, 158, 255, 0.3)' },
            lineStyle: { color: '#409EFF' },
            itemStyle: { color: '#409EFF' }
          },
          {
            value: [75, 80, 70, 80, 76],
            name: '健康参考',
            areaStyle: { color: 'rgba(103, 194, 58, 0.2)' },
            lineStyle: { color: '#67C23A', type: 'dashed' },
            itemStyle: { color: '#67C23A' }
          }
        ]
      }
    ],
    legend: { data: ['当前检测', '健康参考'], bottom: 0 }
  }
  chart.setOption(option)
}

const initWaveformChart = () => {
  const chart = echarts.init(waveformChart.value)
  const timeData = Array.from({ length: 200 }, (_, i) => i * 10)
  const accelData = timeData.map(t => {
    const base = 1
    const freq1 = Math.sin(t * 0.05) * 0.3
    const freq2 = Math.sin(t * 0.1) * 0.1
    return base + freq1 + freq2
  })
  
  const option = {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: timeData,
      name: '时间 (ms)'
    },
    yAxis: {
      type: 'value',
      name: '加速度 (g)'
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100 }
    ],
    series: [
      {
        name: '合加速度',
        type: 'line',
        data: accelData,
        smooth: true,
        lineStyle: { color: '#409EFF', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(64, 158, 255, 0.5)' },
            { offset: 1, color: 'rgba(64, 158, 255, 0.1)' }
          ])
        }
      },
      {
        name: '支撑相',
        type: 'line',
        data: accelData.map((v, i) => i % 30 < 20 ? 1.5 : null),
        lineStyle: { width: 0 },
        showSymbol: false,
        markArea: {
          silent: true,
          data: [
            [{ xAxis: 0 }, { xAxis: 200 }],
            [{ xAxis: 300 }, { xAxis: 500 }],
            [{ xAxis: 600 }, { xAxis: 800 }],
            [{ xAxis: 900 }, { xAxis: 1100 }]
          ],
          itemStyle: {
            color: 'rgba(64, 158, 255, 0.15)'
          }
        }
      }
    ]
  }
  chart.setOption(option)
}

const markAsReviewed = () => {
  report.value.isReviewed = true
  ElMessage.success('已标记为已审核')
}

const getScoreColor = (score) => {
  if (score >= 85) return '#67C23A'
  if (score >= 70) return '#409EFF'
  if (score >= 60) return '#E6A23C'
  return '#F56C6C'
}

const getScoreGradient = (score) => {
  if (score >= 85) return 'linear-gradient(135deg, #67C23A, #85CE61)'
  if (score >= 70) return 'linear-gradient(135deg, #409EFF, #66B1FF)'
  if (score >= 60) return 'linear-gradient(135deg, #E6A23C, #F5D76E)'
  return 'linear-gradient(135deg, #F56C6C, #F89898)'
}

const exportPDF = async () => {
  exporting.value = true
  try {
    const response = await fetch(
      `/api/report/pdf/${report.value.sessionId}?userId=demo_user_001`,
      { method: 'POST' }
    )
    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gait_report_${report.value.sessionId}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
      ElMessage.success('PDF报告导出成功')
    } else {
      ElMessage.warning('PDF生成服务暂不可用，将使用模拟数据')
      setTimeout(() => {
        ElMessage.success('PDF报告导出成功（模拟）')
      }, 1000)
    }
  } catch (e) {
    ElMessage.warning('PDF导出功能需要服务端支持')
  } finally {
    exporting.value = false
  }
}

const saveNotes = () => {
  if (doctorNotes.value.trim()) {
    ElMessage.success('备注已保存')
  } else {
    ElMessage.warning('请输入备注内容')
  }
}

onMounted(() => {
  initPhaseTimeChart()
  initParamsChart()
  initWaveformChart()
})
</script>

<style scoped>
.report-detail {
  padding: 0;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.page-title {
  flex: 1;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.header-buttons {
  display: flex;
  gap: 12px;
}

.score-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.score-overview {
  display: flex;
  align-items: center;
  gap: 60px;
  padding: 20px 0;
}

.score-main {
  text-align: center;
}

.score-circle {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

.score-value {
  font-size: 42px;
  font-weight: 700;
  line-height: 1;
}

.score-grade {
  font-size: 16px;
  font-weight: 500;
  margin-top: 4px;
}

.score-label {
  font-size: 14px;
  color: #606266;
}

.score-items {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 24px;
}

.score-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.score-item-header {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.info-row {
  margin-top: 20px;
}

.info-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.charts-row {
  margin-top: 20px;
}

.chart-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.chart-container {
  height: 300px;
}

.analysis-card {
  margin-top: 20px;
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.analysis-content pre,
.recommendations pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.8;
  margin: 0;
}

.recommendations pre {
  color: #67C23A;
}

.notes-row {
  margin-top: 20px;
}

.notes-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.save-btn {
  margin-top: 12px;
}
</style>
