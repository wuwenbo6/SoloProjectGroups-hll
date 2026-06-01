<template>
  <div class="query-history">
    <div class="history-header">
      <span class="title">Query History</span>
      <button @click="clearHistory" class="btn btn-danger">Clear All</button>
    </div>
    <div class="history-content">
      <div v-if="loading" class="loading">Loading...</div>
      <div v-else-if="history.length === 0" class="empty-state">
        <span>No query history</span>
      </div>
      <div v-else class="history-list">
        <div
          v-for="item in history"
          :key="item.id"
          class="history-item"
          @click="$emit('use-query', item.query)"
        >
          <div class="item-row">
            <span class="item-status" :class="item.success ? 'success' : 'error'">
              {{ item.success ? '✓' : '✗' }}
            </span>
            <span class="item-query">{{ truncateQuery(item.query) }}</span>
          </div>
          <div class="item-meta">
            <span>{{ formatDate(item.createdAt) }}</span>
            <span v-if="item.executionTime">{{ item.executionTime }}ms</span>
            <span v-if="item.resultCount !== undefined">{{ item.resultCount }} results</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { getQueryHistory, clearQueryHistory as clearHistoryApi } from '../api'

export default {
  name: 'QueryHistory',
  emits: ['use-query'],
  data() {
    return {
      history: [],
      loading: false
    }
  },
  mounted() {
    this.loadHistory()
  },
  methods: {
    async loadHistory() {
      this.loading = true
      try {
        const response = await getQueryHistory(0, 50)
        this.history = response.data.content
      } catch (error) {
        console.error('Failed to load history:', error)
      } finally {
        this.loading = false
      }
    },
    async clearHistory() {
      if (!confirm('Clear all query history?')) return
      try {
        await clearHistoryApi()
        this.history = []
      } catch (error) {
        console.error('Failed to clear history:', error)
      }
    },
    truncateQuery(query) {
      const oneLine = query.replace(/\s+/g, ' ')
      return oneLine.length > 50 ? oneLine.substring(0, 50) + '...' : oneLine
    },
    formatDate(dateStr) {
      const date = new Date(dateStr)
      return date.toLocaleString()
    },
    refresh() {
      this.loadHistory()
    }
  }
}
</script>

<style scoped>
.query-history {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #313244;
  border-radius: 8px;
  overflow: hidden;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #45475a;
  border-bottom: 1px solid #585b70;
}

.title {
  font-weight: 600;
  color: #cdd6f4;
}

.btn {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
}

.btn-danger {
  background: #f38ba8;
  color: #1e1e2e;
}

.btn-danger:hover {
  background: #eba0ac;
}

.history-content {
  flex: 1;
  overflow-y: auto;
}

.loading {
  padding: 20px;
  text-align: center;
  color: #6c7086;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #6c7086;
}

.history-list {
  display: flex;
  flex-direction: column;
}

.history-item {
  padding: 12px 16px;
  border-bottom: 1px solid #45475a;
  cursor: pointer;
  transition: background 0.2s;
}

.history-item:hover {
  background: #45475a;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.item-status {
  font-size: 14px;
  width: 20px;
  text-align: center;
}

.item-status.success {
  color: #a6e3a1;
}

.item-status.error {
  color: #f38ba8;
}

.item-query {
  flex: 1;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  color: #cdd6f4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #6c7086;
  margin-left: 28px;
}
</style>
