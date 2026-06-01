<template>
  <div class="query-result">
    <div class="result-header">
      <span class="title">Query Result</span>
      <div class="stats" v-if="result">
        <span v-if="result.success" class="stat success">Success</span>
        <span v-else class="stat error">Error</span>
        <span v-if="result.executionTime !== undefined" class="stat">{{ result.executionTime }}ms</span>
        <span v-if="result.resultCount !== undefined" class="stat">{{ result.resultCount }} results</span>
        <span v-if="result.truncated" class="stat warning">Truncated (max {{ result.maxResults }})</span>
      </div>
      <button
        v-if="result && result.success && result.results && result.results.length > 0"
        @click="exportCsv"
        class="export-btn"
      >
        Export CSV
      </button>
    </div>
    <div class="result-content">
      <div v-if="!result" class="empty-state">
        <span>Execute a query to see results</span>
      </div>
      <div v-else-if="!result.success" class="error-message">
        <div class="error-icon">⚠</div>
        <div class="error-text">{{ result.error }}</div>
      </div>
      <div v-else-if="result.results && result.results.length === 0" class="empty-state">
        <span>No results returned</span>
      </div>
      <div v-else class="results-list">
        <div v-for="(item, index) in result.results" :key="index" class="result-item">
          <div class="item-header">
            <span class="item-index">{{ index + 1 }}</span>
            <span class="item-type" :class="item.type">{{ item.type }}</span>
          </div>
          <div class="item-content">
            <pre>{{ formatItem(item) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { exportCsv as exportCsvApi } from '../api'

export default {
  name: 'QueryResult',
  props: {
    result: {
      type: Object,
      default: null
    }
  },
  methods: {
    formatItem(item) {
      if (item.type === 'vertex' || item.type === 'edge') {
        const { type, ...rest } = item
        return JSON.stringify(rest, null, 2)
      }
      if (item.type === 'value') {
        return item.value
      }
      return JSON.stringify(item, null, 2)
    },
    async exportCsv() {
      try {
        const response = await exportCsvApi(this.result.results)
        const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `query-results-${Date.now()}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } catch (error) {
        alert('Export failed: ' + (error.response?.data?.error || error.message))
      }
    }
  }
}
</script>

<style scoped>
.query-result {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #313244;
  border-radius: 8px;
  overflow: hidden;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #45475a;
  border-bottom: 1px solid #585b70;
  gap: 12px;
}

.title {
  font-weight: 600;
  color: #cdd6f4;
}

.stats {
  display: flex;
  gap: 12px;
  flex: 1;
}

.export-btn {
  background: #a6e3a1;
  color: #1e1e2e;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.export-btn:hover {
  background: #94e2d5;
}

.stat {
  font-size: 13px;
  color: #a6adc8;
  padding: 2px 8px;
  background: #585b70;
  border-radius: 4px;
}

.stat.success {
  background: #a6e3a1;
  color: #1e1e2e;
}

.stat.error {
  background: #f38ba8;
  color: #1e1e2e;
}

.stat.warning {
  background: #fab387;
  color: #1e1e2e;
}

.result-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6c7086;
}

.error-message {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: rgba(243, 139, 168, 0.1);
  border: 1px solid #f38ba8;
  border-radius: 8px;
}

.error-icon {
  font-size: 24px;
  color: #f38ba8;
}

.error-text {
  color: #f38ba8;
  font-size: 14px;
  line-height: 1.5;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  background: #1e1e2e;
  border-radius: 8px;
  overflow: hidden;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #45475a;
}

.item-index {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #89b4fa;
  color: #1e1e2e;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
}

.item-type {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #585b70;
  color: #cdd6f4;
}

.item-type.vertex {
  background: #89b4fa;
  color: #1e1e2e;
}

.item-type.edge {
  background: #fab387;
  color: #1e1e2e;
}

.item-content {
  padding: 12px;
  overflow-x: auto;
}

pre {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #cdd6f4;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
