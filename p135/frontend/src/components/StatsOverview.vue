<template>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="label">接收报文</div>
      <div class="value">{{ formatNumber(stats.receiver?.packets_received || 0) }}<span class="unit">pkts</span></div>
    </div>
    <div class="stat-card">
      <div class="label">解析记录</div>
      <div class="value">{{ formatNumber(stats.receiver?.records_parsed || 0) }}<span class="unit">条</span></div>
    </div>
    <div class="stat-card">
      <div class="label">总流量</div>
      <div class="value">{{ formatBytesFn(stats.processor?.total_bytes || 0) }}</div>
    </div>
    <div class="stat-card">
      <div class="label">总数据包</div>
      <div class="value">{{ formatNumber(stats.processor?.total_packets || 0) }}<span class="unit">pkts</span></div>
    </div>
    <div class="stat-card">
      <div class="label">流速</div>
      <div class="value">{{ (stats.processor?.flow_rate || 0).toFixed(1) }}<span class="unit">/s</span></div>
    </div>
    <div class="stat-card">
      <div class="label">数据库记录</div>
      <div class="value">{{ formatNumber(stats.storage?.total_records || 0) }}<span class="unit">条</span></div>
    </div>
    <div class="stat-card" :class="{ 'stat-card-alarm': isDropAlarm }">
      <div class="label">
        <span v-if="isDropAlarm" style="color: #ef4444;">⚠️ </span>
        UDP 丢包率
      </div>
      <div class="value" :style="{ color: isDropAlarm ? '#ef4444' : '#22c55e' }">
        {{ dropRate.toFixed(3) }}<span class="unit">%</span>
      </div>
      <div class="sub-value" style="font-size: 12px; color: #94a3b8; margin-top: 4px;">
        内核丢包: {{ formatNumber(stats.receiver?.kernel_drops || 0) }}
      </div>
    </div>
    <div class="stat-card" v-if="stats.receiver?.estimated_lost_bytes > 0">
      <div class="label">估算丢失流量</div>
      <div class="value" style="color: #f59e0b;">
        {{ formatBytesFn(stats.receiver?.estimated_lost_bytes || 0) }}
      </div>
      <div class="sub-value" style="font-size: 12px; color: #94a3b8; margin-top: 4px;">
        补偿后: {{ formatBytesFn((stats.processor?.total_bytes || 0) + (stats.receiver?.compensated_bytes || 0)) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatBytes, formatPackets } from '../api.js'

const props = defineProps({
  stats: {
    type: Object,
    default: () => ({})
  }
})

const dropRate = computed(() => {
  return props.stats.receiver?.drop_rate || 0
})

const isDropAlarm = computed(() => {
  return dropRate.value > 1.0
})

const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + ' M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + ' K'
  }
  return num.toString()
}

const formatBytesFn = (bytes) => {
  return formatBytes(bytes)
}
</script>

<style scoped>
.stat-card-alarm {
  border-color: #ef4444 !important;
  animation: alarm-pulse 1s infinite;
}

@keyframes alarm-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 20px 5px rgba(239, 68, 68, 0.2); }
}
</style>
