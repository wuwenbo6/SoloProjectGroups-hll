<template>
  <div class="report-panel">
    <h3>📊 报表导出</h3>
    
    <div class="report-options">
      <div class="option-group">
        <label>报表类型</label>
        <select v-model="reportType">
          <option value="topn">Top N 流量</option>
          <option value="historical">历史流量</option>
          <option value="alerts">安全告警</option>
          <option value="full">完整报告</option>
        </select>
      </div>

      <div class="option-group">
        <label>输出格式</label>
        <select v-model="format">
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
          <option value="txt">TXT</option>
        </select>
      </div>

      <div class="option-group" v-if="reportType === 'topn'">
        <label>Top N</label>
        <select v-model="topN">
          <option :value="5">5</option>
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </div>

      <div class="option-group" v-if="reportType !== 'topn'">
        <label>时间范围</label>
        <select v-model="timeRange">
          <option value="1h">最近 1 小时</option>
          <option value="6h">最近 6 小时</option>
          <option value="24h">最近 24 小时</option>
          <option value="7d">最近 7 天</option>
        </select>
      </div>

      <div class="option-group">
        <label>ASN过滤</label>
        <select v-model="asnFilter">
          <option :value="0">全部</option>
          <option v-for="asn in asns" :key="asn.asn" :value="asn.asn">
            AS{{ asn.asn }} - {{ asn.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="report-actions">
      <button class="btn" @click="generateReport" :disabled="generating">
        {{ generating ? '生成中...' : '生成报表' }}
      </button>
      <button 
        class="btn btn-secondary" 
        v-if="reportUrl"
        @click="downloadReport"
      >
        下载
      </button>
    </div>

    <div v-if="preview" class="report-preview">
      <h4>预览 (前10行)</h4>
      <pre>{{ preview }}</pre>
    </div>

    <div class="report-history">
      <h4>历史报表</h4>
      <div v-if="reports.length > 0" class="history-list">
        <div v-for="report in reports" :key="report.name" class="history-item">
          <span>{{ report.name }}</span>
          <span class="report-size">{{ formatSize(report.size) }}</span>
          <span class="report-date">{{ formatDate(report.date) }}</span>
        </div>
      </div>
      <div v-else class="no-reports">暂无历史报表</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const API_BASE = '/api'

const reportType = ref('topn')
const format = ref('json')
const topN = ref(10)
const timeRange = ref('1h')
const asnFilter = ref(0)
const generating = ref(false)
const reportUrl = ref('')
const preview = ref('')
const reports = ref([])
const asns = ref([])

const loadASNs = async () => {
  try {
    const res = await axios.get(`${API_BASE}/asns`)
    asns.value = res.data || []
  } catch (e) {
    console.error('Failed to load ASNs:', e)
  }
}

const loadReports = async () => {
  try {
    const res = await axios.get(`${API_BASE}/reports`)
    reports.value = res.data.reports || []
  } catch (e) {
    console.error('Failed to load reports:', e)
  }
}

const generateReport = async () => {
  generating.value = true
  preview.value = ''

  try {
    let url = ''
    const params = {
      format: format.value,
    }

    switch (reportType.value) {
      case 'topn':
        url = `${API_BASE}/reports/topn`
        params.limit = topN.value
        break
      case 'historical':
        url = `${API_BASE}/reports/historical`
        addTimeParams(params)
        break
      case 'alerts':
        url = `${API_BASE}/reports/alerts`
        break
      case 'full':
        url = `${API_BASE}/reports/full`
        addTimeParams(params)
        break
    }

    if (asnFilter.value > 0 && reportType.value !== 'alerts') {
      params.asn = asnFilter.value
    }

    const response = await axios.get(url, {
      params,
      responseType: 'blob'
    })

    const contentDisposition = response.headers['content-disposition']
    let filename = `report.${format.value}`
    if (contentDisposition) {
      const matches = contentDisposition.match(/filename="?([^"]+)"?/)
      if (matches) filename = matches[1]
    }

    const blob = new Blob([response.data])
    reportUrl.value = window.URL.createObjectURL(blob)

    if (format.value !== 'txt') {
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result
        preview.value = text.slice(0, 2000) + (text.length > 2000 ? '\n...' : '')
      }
      reader.readAsText(blob.slice(0, 10000))
    }

    loadReports()
  } catch (e) {
    console.error('Failed to generate report:', e)
    alert('生成报表失败: ' + e.message)
  } finally {
    generating.value = false
  }
}

const addTimeParams = (params) => {
  const now = new Date()
  let startTime = new Date()
  
  switch (timeRange.value) {
    case '1h': startTime.setHours(now.getHours() - 1); break
    case '6h': startTime.setHours(now.getHours() - 6); break
    case '24h': startTime.setHours(now.getHours() - 24); break
    case '7d': startTime.setDate(now.getDate() - 7); break
  }

  params.start = startTime.toISOString()
  params.end = now.toISOString()
}

const downloadReport = () => {
  if (!reportUrl.value) return
  
  const a = document.createElement('a')
  a.href = reportUrl.value
  a.download = `sflow_report.${format.value}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleString()
}

onMounted(() => {
  loadASNs()
  loadReports()
})
</script>

<style scoped>
.report-panel {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 20px;
}

.report-panel h3 {
  font-size: 18px;
  color: #f1f5f9;
  margin-bottom: 16px;
}

.report-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.option-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.option-group label {
  font-size: 12px;
  color: #94a3b8;
}

.option-group select {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px 12px;
  color: #e2e8f0;
  font-size: 14px;
}

.report-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.btn {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #334155;
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.report-preview {
  background: #0f172a;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.report-preview h4 {
  font-size: 14px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.report-preview pre {
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 11px;
  color: #a78bfa;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.report-history h4 {
  font-size: 14px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.history-list {
  max-height: 150px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #0f172a;
  border-radius: 6px;
  margin-bottom: 4px;
  font-size: 12px;
}

.history-item span:first-child {
  flex: 1;
  color: #e2e8f0;
}

.report-size {
  color: #64748b;
  margin: 0 12px;
}

.report-date {
  color: #64748b;
}

.no-reports {
  text-align: center;
  padding: 20px;
  color: #64748b;
  font-size: 13px;
}
</style>
