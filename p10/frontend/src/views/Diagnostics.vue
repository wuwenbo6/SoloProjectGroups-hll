<template>
  <div class="diagnostics">
    <el-tabs v-model="activeTab" type="card">
      <el-tab-pane label="异常告警" name="anomalies">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>异常检测 (孤立森林算法)</span>
              <el-button type="primary" @click="loadAnomalies">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
          </template>

          <el-alert
            v-if="anomalyStats.total > 0"
            :title="`检测到 ${anomalyStats.anomalies} 条异常数据`"
            type="warning"
            :closable="false"
            style="margin-bottom: 20px"
          />

          <el-table :data="anomalies" stripe v-loading="loading">
            <el-table-column prop="device_id" label="设备ID" width="180" />
            <el-table-column prop="type" label="类型" width="120">
              <template #default="{ row }">
                <el-tag size="small">{{ row.type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="value" label="数值" width="120">
              <template #default="{ row }">
                <span :class="{ 'anomaly-value': row.is_anomaly }">
                  {{ row.value.toFixed(2) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="score" label="异常分" width="120">
              <template #default="{ row }">
                <el-progress
                  :percentage="Math.round(row.score * 100)"
                  :color="getScoreColor(row.score)"
                  :stroke-width="8"
                />
              </template>
            </el-table-column>
            <el-table-column prop="is_anomaly" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.is_anomaly ? 'danger' : 'success'" size="small">
                  {{ row.is_anomaly ? '异常' : '正常' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="timestamp" label="时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.timestamp) }}
              </template>
            </el-table-column>
          </el-table>

          <el-empty v-if="anomalies.length === 0" description="暂无异常数据" />
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="设备诊断" name="diagnostics">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>通信质量诊断</span>
              <el-button type="primary" @click="loadDiagnostics">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
          </template>

          <el-row :gutter="20">
            <el-col :span="8" v-for="diag in diagnostics" :key="diag.device_id">
              <el-card class="diagnostic-card" shadow="hover">
                <div class="diag-header">
                  <span class="device-name">{{ diag.device_id }}</span>
                  <el-tag :type="getStatusType(diag.status)" size="small">
                    {{ getStatusText(diag.status) }}
                  </el-tag>
                </div>

                <div class="health-score">
                  <el-progress
                    type="dashboard"
                    :percentage="Math.round(diag.health_score)"
                    :color="getHealthColor(diag.health_score)"
                    :width="100"
                  />
                  <span class="health-label">健康评分</span>
                </div>

                <div class="diag-metrics">
                  <div class="metric">
                    <span class="metric-label">消息数</span>
                    <span class="metric-value">{{ diag.message_count || 0 }}</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">丢包率</span>
                    <span class="metric-value" :class="{ 'warning-text': diag.packet_loss_rate > 1 }">
                      {{ (diag.packet_loss_rate || 0).toFixed(2) }}%
                    </span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">平均延迟</span>
                    <span class="metric-value">{{ (diag.avg_latency_ms || 0).toFixed(1) }}ms</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">信号质量</span>
                    <span class="metric-value">{{ (diag.signal_quality || 0).toFixed(0) }}%</span>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <el-empty v-if="diagnostics.length === 0" description="暂无诊断数据" style="margin-top: 40px" />
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="养殖报告" name="report">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>养殖报告生成</span>
              <div>
                <el-select v-model="reportDays" style="width: 120px; margin-right: 10px">
                  <el-option label="最近7天" :value="7" />
                  <el-option label="最近15天" :value="15" />
                  <el-option label="最近30天" :value="30" />
                </el-select>
                <el-button type="primary" @click="loadReport">
                  <el-icon><Document /></el-icon>
                  生成报告
                </el-button>
              </div>
            </div>
          </template>

          <div v-if="report" v-loading="reportLoading">
            <el-descriptions :column="3" border style="margin-bottom: 20px">
              <el-descriptions-item label="报告编号">{{ report.report_id }}</el-descriptions-item>
              <el-descriptions-item label="生成时间">{{ formatDate(report.generated_at) }}</el-descriptions-item>
              <el-descriptions-item label="统计周期">
                {{ formatDate(report.period_start) }} ~ {{ formatDate(report.period_end) }}
              </el-descriptions-item>
              <el-descriptions-item label="设备总数">{{ report.summary.total_devices }}</el-descriptions-item>
              <el-descriptions-item label="在线设备">{{ report.summary.online_devices }}</el-descriptions-item>
              <el-descriptions-item label="系统健康度">
                <el-tag :type="report.summary.system_health >= 80 ? 'success' : 'warning'">
                  {{ report.summary.system_health }}%
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="消息总数">{{ report.summary.total_messages }}</el-descriptions-item>
              <el-descriptions-item label="异常数">
                <el-tag :type="report.summary.anomaly_count > 5 ? 'danger' : 'info'">
                  {{ report.summary.anomaly_count }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>

            <el-divider content-position="left">设备统计</el-divider>
            <el-table :data="report.device_stats" stripe style="margin-bottom: 20px">
              <el-table-column prop="device_id" label="设备ID" width="180" />
              <el-table-column prop="name" label="名称" width="120" />
              <el-table-column prop="type" label="类型" width="100" />
              <el-table-column prop="avg_value" label="平均值" width="100">
                <template #default="{ row }">{{ row.avg_value.toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="min_value" label="最小值" width="100">
                <template #default="{ row }">{{ row.min_value.toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="max_value" label="最大值" width="100">
                <template #default="{ row }">{{ row.max_value.toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="data_points" label="数据点" width="100" />
              <el-table-column prop="health_score" label="健康分" width="120">
                <template #default="{ row }">
                  <el-progress
                    :percentage="Math.round(row.health_score)"
                    :color="getHealthColor(row.health_score)"
                    :stroke-width="6"
                  />
                </template>
              </el-table-column>
            </el-table>

            <el-divider content-position="left">系统建议</el-divider>
            <el-alert
              v-for="(rec, index) in report.recommendations"
              :key="index"
              :title="rec"
              type="info"
              :closable="false"
              style="margin-bottom: 10px"
            />

            <div class="export-actions" style="margin-top: 30px">
              <el-button type="success" size="large" @click="exportReport('json')">
                <el-icon><Download /></el-icon>
                导出 JSON
              </el-button>
              <el-button type="warning" size="large" @click="exportReport('csv')">
                <el-icon><Download /></el-icon>
                导出 CSV
              </el-button>
            </div>
          </div>

          <el-empty v-if="!report && !reportLoading" description="点击生成报告按钮查看统计数据" />
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getAnomalies, getDiagnostics, generateReport, exportReport as apiExportReport } from '@/api'

const activeTab = ref('anomalies')
const loading = ref(false)
const reportLoading = ref(false)
const anomalies = ref([])
const diagnostics = ref([])
const report = ref(null)
const reportDays = ref(7)

const anomalyStats = ref({
  total: 0,
  anomalies: 0
})

const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const getScoreColor = (score) => {
  if (score > 0.7) return '#f56c6c'
  if (score > 0.5) return '#e6a23c'
  return '#67c23a'
}

const getStatusType = (status) => {
  const types = {
    excellent: 'success',
    good: '',
    warning: 'warning',
    critical: 'danger'
  }
  return types[status] || 'info'
}

const getStatusText = (status) => {
  const texts = {
    excellent: '优秀',
    good: '良好',
    warning: '警告',
    critical: '严重'
  }
  return texts[status] || '未知'
}

const getHealthColor = (score) => {
  if (score >= 90) return '#67c23a'
  if (score >= 70) return '#409eff'
  if (score >= 50) return '#e6a23c'
  return '#f56c6c'
}

const loadAnomalies = async () => {
  loading.value = true
  try {
    const res = await getAnomalies(100)
    anomalies.value = res.data
    anomalyStats.value = {
      total: res.data.length,
      anomalies: res.data.filter(a => a.is_anomaly).length
    }
  } catch (e) {
    ElMessage.error('加载异常数据失败')
  } finally {
    loading.value = false
  }
}

const loadDiagnostics = async () => {
  loading.value = true
  try {
    const res = await getDiagnostics()
    diagnostics.value = res.data
  } catch (e) {
    ElMessage.error('加载诊断数据失败')
  } finally {
    loading.value = false
  }
}

const loadReport = async () => {
  reportLoading.value = true
  try {
    const res = await generateReport(reportDays.value)
    report.value = res.data
    ElMessage.success('报告生成成功')
  } catch (e) {
    ElMessage.error('生成报告失败')
  } finally {
    reportLoading.value = false
  }
}

const exportReport = async (format) => {
  try {
    const res = await apiExportReport(reportDays.value, format)
    const blob = new Blob([res.data])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `farm_report_${Date.now()}.${format}`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`导出 ${format.toUpperCase()} 成功`)
  } catch (e) {
    ElMessage.error('导出失败')
  }
}

onMounted(() => {
  loadAnomalies()
  loadDiagnostics()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  font-size: 16px;
}
.anomaly-value {
  color: #f56c6c;
  font-weight: bold;
}
.diagnostic-card {
  margin-bottom: 20px;
}
.diag-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}
.device-name {
  font-weight: 600;
  font-size: 14px;
}
.health-score {
  text-align: center;
  margin-bottom: 15px;
}
.health-label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}
.diag-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.metric {
  text-align: center;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
}
.metric-label {
  display: block;
  font-size: 12px;
  color: #909399;
}
.metric-value {
  display: block;
  font-size: 16px;
  font-weight: 600;
  margin-top: 4px;
}
.warning-text {
  color: #e6a23c;
}
.export-actions {
  display: flex;
  gap: 15px;
  justify-content: center;
}
</style>
