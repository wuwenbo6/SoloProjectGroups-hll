<template>
  <div class="table-container" style="overflow-x: auto;">
    <table v-if="type === 'ip_pairs'">
      <thead>
        <tr>
          <th style="width: 40px;">#</th>
          <th>源 IP</th>
          <th>目的 IP</th>
          <th>源 ASN</th>
          <th>目的 ASN</th>
          <th>流量</th>
          <th>数据包</th>
          <th style="width: 120px;">占比</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in sortedData" :key="index">
          <td>
            <span :class="getRankClass(index)">{{ index + 1 }}</span>
          </td>
          <td><code>{{ item.src_ip }}</code></td>
          <td><code>{{ item.dst_ip }}</code></td>
          <td>
            <span v-if="item.src_asn" class="badge badge-other">
              AS{{ item.src_asn }}
            </span>
            <span v-else class="badge badge-other">-</span>
          </td>
          <td>
            <span v-if="item.dst_asn" class="badge badge-other">
              AS{{ item.dst_asn }}
            </span>
            <span v-else class="badge badge-other">-</span>
          </td>
          <td><strong>{{ formatBytes(item.bytes) }}</strong></td>
          <td>{{ item.packets.toLocaleString() }}</td>
          <td>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: getPercentage(item.bytes) + '%' }"></div>
            </div>
            <span style="font-size: 11px; color: #94a3b8;">{{ getPercentage(item.bytes).toFixed(1) }}%</span>
          </td>
        </tr>
        <tr v-if="sortedData.length === 0">
          <td colspan="8" style="text-align: center; padding: 40px; color: #64748b;">
            暂无数据
          </td>
        </tr>
      </tbody>
    </table>

    <table v-else>
      <thead>
        <tr>
          <th style="width: 40px;">#</th>
          <th>应用</th>
          <th>端口</th>
          <th>协议</th>
          <th>流量</th>
          <th>数据包</th>
          <th style="width: 120px;">占比</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in sortedData" :key="index">
          <td>
            <span :class="getRankClass(index)">{{ index + 1 }}</span>
          </td>
          <td><strong>{{ item.app_name || 'Unknown' }}</strong></td>
          <td>{{ item.port }}</td>
          <td>
            <span :class="getProtocolBadge(item.protocol_str)">
              {{ item.protocol_str }}
            </span>
          </td>
          <td><strong>{{ formatBytes(item.bytes) }}</strong></td>
          <td>{{ item.packets.toLocaleString() }}</td>
          <td>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: getPercentage(item.bytes) + '%' }"></div>
            </div>
            <span style="font-size: 11px; color: #94a3b8;">{{ getPercentage(item.bytes).toFixed(1) }}%</span>
          </td>
        </tr>
        <tr v-if="sortedData.length === 0">
          <td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">
            暂无数据
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatBytes, getProtocolBadge } from '../api.js'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  type: {
    type: String,
    default: 'ip_pairs'
  }
})

const sortedData = computed(() => {
  if (!props.data || props.data.length === 0) return []
  return [...props.data].sort((a, b) => b.bytes - a.bytes)
})

const totalBytes = computed(() => {
  return sortedData.value.reduce((sum, item) => sum + item.bytes, 0)
})

const getPercentage = (bytes) => {
  if (totalBytes.value === 0) return 0
  return (bytes / totalBytes.value) * 100
}

const getRankClass = (index) => {
  if (index === 0) return 'badge'
  if (index === 1) return 'badge badge-udp'
  if (index === 2) return 'badge badge-icmp'
  return 'badge badge-other'
}
</script>

<style scoped>
code {
  background: #0f172a;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', monospace;
}
</style>
