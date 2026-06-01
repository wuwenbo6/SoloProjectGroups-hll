<template>
  <div class="alert-panel">
    <div class="alert-header">
      <h3>🛡️ 安全告警</h3>
      <div class="alert-filters">
        <select v-model="statusFilter" @change="loadAlerts">
          <option value="">全部状态</option>
          <option value="active">活动中</option>
          <option value="ended">已结束</option>
        </select>
      </div>
    </div>

    <div class="alert-stats" v-if="alertStats">
      <div class="alert-stat">
        <div class="label">活动告警</div>
        <div class="value active">{{ alertStats.active }}</div>
      </div>
      <div class="alert-stat">
        <div class="label">总告警数</div>
        <div class="value">{{ alertStats.total }}</div>
      </div>
      <div class="alert-stat">
        <div class="label">关键告警</div>
        <div class="value critical">{{ alertStats.critical }}</div>
      </div>
    </div>

    <div class="alert-list" v-if="alerts.length > 0">
      <div 
        v-for="alert in alerts" 
        :key="alert.id" 
        class="alert-item"
        :class="getSeverityClass(alert.severity)"
      >
        <div class="alert-type-badge" :class="getTypeClass(alert.type_str)">
          {{ getTypeIcon(alert.type_str) }} {{ alert.type_str }}
        </div>
        <div class="alert-content">
          <div class="alert-desc">{{ alert.description }}</div>
          <div class="alert-meta">
            <span v-if="alert.target_ip">目标: <code>{{ alert.target_ip }}</code></span>
            <span v-if="alert.target_port">端口: {{ alert.target_port }}</span>
            <span>流量: {{ formatBytes(alert.attack_bytes) }}</span>
            <span>包数: {{ alert.attack_packets }}</span>
          </div>
          <div class="alert-time">
            <span>开始: {{ formatTime(alert.start_at) }}</span>
            <span>持续: {{ formatDuration(alert.duration) }}</span>
          </div>
        </div>
        <div class="alert-status" :class="alert.status">
          {{ alert.status === 'active' ? '● 活动中' : '○ 已结束' }}
        </div>
      </div>
    </div>

    <div class="no-alerts" v-else>
      ✅ 暂无安全告警
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { api, formatBytes } from '../api.js'

const alerts = ref([])
const statusFilter = ref('')

const alertStats = computed(() => {
  const stats = { active: 0, total: alerts.value.length, critical: 0 }
  for (const alert of alerts.value) {
    if (alert.status === 'active') stats.active++
    if (alert.severity === 'critical') stats.critical++
  }
  return stats
})

const loadAlerts = async () => {
  try {
    const res = await api.getAlerts(statusFilter.value)
    alerts.value = res.alerts || []
  } catch (e) {
    console.error('Failed to load alerts:', e)
  }
}

const getSeverityClass = (severity) => {
  switch (severity) {
    case 'critical': return 'severity-critical'
    case 'high': return 'severity-high'
    case 'medium': return 'severity-medium'
    case 'low': return 'severity-low'
    default: return 'severity-info'
  }
}

const getTypeClass = (type) => {
  if (type.includes('SYN')) return 'type-syn'
  if (type.includes('UDP')) return 'type-udp'
  if (type.includes('ICMP')) return 'type-icmp'
  if (type.includes('Scan')) return 'type-scan'
  return 'type-other'
}

const getTypeIcon = (type) => {
  if (type.includes('SYN')) return '🔴'
  if (type.includes('UDP')) return '🟣'
  if (type.includes('ICMP')) return '🟠'
  if (type.includes('Scan')) return '🔍'
  return '⚠️'
}

const formatTime = (t) => {
  if (!t) return '-'
  return new Date(t).toLocaleString()
}

const formatDuration = (duration) => {
  if (!duration) return '-'
  const seconds = Math.floor(duration / 1000000000)
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  return `${Math.floor(seconds / 3600)}小时`
}

onMounted(() => {
  loadAlerts()
  const interval = setInterval(loadAlerts, 5000)
  return () => clearInterval(interval)
})
</script>

<style scoped>
.alert-panel {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 20px;
}

.alert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.alert-header h3 {
  font-size: 18px;
  color: #f1f5f9;
}

.alert-filters select {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 12px;
  color: #e2e8f0;
  font-size: 14px;
}

.alert-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.alert-stat {
  flex: 1;
  background: #0f172a;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}

.alert-stat .label {
  font-size: 12px;
  color: #94a3b8;
}

.alert-stat .value {
  font-size: 24px;
  font-weight: 700;
  color: #f1f5f9;
}

.alert-stat .value.active {
  color: #ef4444;
}

.alert-stat .value.critical {
  color: #f59e0b;
}

.alert-list {
  max-height: 400px;
  overflow-y: auto;
}

.alert-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 8px;
  border-left: 3px solid;
}

.severity-critical {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
}

.severity-high {
  background: rgba(249, 115, 22, 0.1);
  border-color: #f97316;
}

.severity-medium {
  background: rgba(234, 179, 8, 0.1);
  border-color: #eab308;
}

.severity-low {
  background: rgba(100, 116, 139, 0.1);
  border-color: #64748b;
}

.alert-type-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.type-syn {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.type-udp {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
}

.type-icmp {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

.type-scan {
  background: rgba(6, 182, 212, 0.2);
  color: #22d3ee;
}

.type-other {
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
}

.alert-content {
  flex: 1;
}

.alert-desc {
  font-size: 14px;
  color: #e2e8f0;
  margin-bottom: 4px;
}

.alert-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #94a3b8;
  flex-wrap: wrap;
}

.alert-meta code {
  background: #0f172a;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.alert-time {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.alert-status {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 9999px;
}

.alert-status.active {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.alert-status.ended {
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
}

.no-alerts {
  text-align: center;
  padding: 40px;
  color: #22c55e;
  font-size: 16px;
}
</style>
