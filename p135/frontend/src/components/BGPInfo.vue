<template>
  <div class="bgp-panel">
    <div class="bgp-header">
      <h3>🌐 BGP 路由信息</h3>
      <div class="bgp-actions">
        <button class="btn btn-sm" @click="showLookup = true">IP查询</button>
        <button class="btn btn-sm btn-secondary" @click="loadStats">刷新统计</button>
      </div>
    </div>

    <div v-if="showLookup" class="bgp-lookup">
      <input 
        v-model="lookupIP" 
        type="text" 
        placeholder="输入IP地址查询..."
        @keyup.enter="lookupIPAddr"
      />
      <button class="btn btn-sm" @click="lookupIPAddr">查询</button>
      <button class="btn btn-sm btn-secondary" @click="showLookup = false">关闭</button>
    </div>

    <div v-if="lookupResult" class="lookup-result" :class="{ found: lookupResult.found }">
      <template v-if="lookupResult.found">
        <div class="lookup-info">
          <div><strong>前缀:</strong> {{ lookupResult.info.prefix }}</div>
          <div><strong>ASN:</strong> AS{{ lookupResult.info.asn }} ({{ lookupResult.info.as_name }})</div>
          <div v-if="lookupResult.info.description"><strong>描述:</strong> {{ lookupResult.info.description }}</div>
          <div v-if="lookupResult.info.country_code"><strong>国家:</strong> {{ lookupResult.info.country_code }}</div>
          <div><strong>类型:</strong> {{ lookupResult.info.type }}</div>
        </div>
      </template>
      <template v-else>
        <div class="lookup-not-found">未找到该IP的BGP路由信息</div>
      </template>
    </div>

    <div v-if="bgpStats" class="bgp-stats">
      <div class="stat">
        <div class="label">前缀总数</div>
        <div class="value">{{ bgpStats.total_prefixes }}</div>
      </div>
      <div class="stat">
        <div class="label">ASN总数</div>
        <div class="value">{{ bgpStats.total_asns }}</div>
      </div>
    </div>

    <div class="bgp-routes">
      <h4>路由条目 ({{ routes.length }})</h4>
      <div class="route-list">
        <div v-for="route in routes.slice(0, 10)" :key="route.prefix" class="route-item">
          <div class="route-prefix">{{ route.prefix }}</div>
          <div class="route-asn">AS{{ route.asn }} ({{ route.as_name || 'Unknown' }})</div>
          <div v-if="route.next_hop" class="route-nexthop">下一跳: {{ route.next_hop }}</div>
        </div>
      </div>
      <div v-if="routes.length === 0" class="no-routes">暂无路由条目</div>
    </div>

    <div class="private-ip-info">
      <h4>IP分类工具</h4>
      <input 
        v-model="checkIP" 
        type="text" 
        placeholder="检查IP类型..."
      />
      <button class="btn btn-sm" @click="checkIPType">检查</button>
      <div v-if="ipCheckResult" class="ip-check-result">
        <span :class="ipCheckResult.class">{{ ipCheckResult.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const API_BASE = '/api'

const routes = ref([])
const bgpStats = ref(null)
const showLookup = ref(false)
const lookupIP = ref('')
const lookupResult = ref(null)
const checkIP = ref('')
const ipCheckResult = ref(null)

const loadRoutes = async () => {
  try {
    const res = await axios.get(`${API_BASE}/bgp/routes`)
    routes.value = res.data.routes || []
  } catch (e) {
    console.error('Failed to load BGP routes:', e)
  }
}

const loadStats = async () => {
  try {
    const res = await axios.get(`${API_BASE}/bgp/stats`)
    bgpStats.value = res.data
  } catch (e) {
    console.error('Failed to load BGP stats:', e)
  }
}

const lookupIPAddr = async () => {
  if (!lookupIP.value) return
  
  try {
    const res = await axios.get(`${API_BASE}/bgp/lookup/${lookupIP.value}`)
    lookupResult.value = res.data
  } catch (e) {
    console.error('Lookup failed:', e)
    lookupResult.value = { found: false }
  }
}

const checkIPType = () => {
  const ip = checkIP.value.trim()
  if (!ip) {
    ipCheckResult.value = null
    return
  }

  const isPrivate = isPrivateIP(ip)
  const isReserved = isReservedIP(ip)

  if (isPrivate) {
    ipCheckResult.value = { class: 'ip-private', message: `✓ ${ip} 是私有IP地址 (RFC 1918)` }
  } else if (isReserved) {
    ipCheckResult.value = { class: 'ip-reserved', message: `⚠ ${ip} 是保留/特殊地址` }
  } else {
    ipCheckResult.value = { class: 'ip-public', message: `✓ ${ip} 是公网IP地址` }
  }
}

const isPrivateIP = (ip) => {
  const patterns = [
    { pattern: /^10\./, desc: '10.0.0.0/8' },
    { pattern: /^172\.(1[6-9]|2\d|3[01])\./, desc: '172.16.0.0/12' },
    { pattern: /^192\.168\./, desc: '192.168.0.0/16' },
    { pattern: /^127\./, desc: '127.0.0.0/8 (Loopback)' },
    { pattern: /^169\.254\./, desc: '169.254.0.0/16 (Link-Local)' },
    { pattern: /^fe80:/, desc: 'fe80::/10 (IPv6 Link-Local)' },
    { pattern: /^fc/, desc: 'fc00::/7 (IPv6 Unique Local)' },
  ]

  for (const { pattern } of patterns) {
    if (pattern.test(ip)) return true
  }
  return false
}

const isReservedIP = (ip) => {
  const patterns = [
    { pattern: /^0\./, desc: '0.0.0.0/8' },
    { pattern: /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, desc: '100.64.0.0/10' },
    { pattern: /^192\.0\.0\./, desc: '192.0.0.0/24' },
    { pattern: /^192\.0\.2\./, desc: '192.0.2.0/24 (TEST-NET-1)' },
    { pattern: /^198\.51\.100\./, desc: '198.51.100.0/24 (TEST-NET-2)' },
    { pattern: /^203\.0\.113\./, desc: '203.0.113.0/24 (TEST-NET-3)' },
    { pattern: /^22[4-9]\./, desc: '224.0.0.0/4 (Multicast)' },
    { pattern: /^2[3-5]\d\./, desc: '224.0.0.0/4 (Multicast)' },
    { pattern: /^::1$/, desc: '::1/128 (Loopback)' },
    { pattern: /^::ffff:/, desc: '::ffff:0:0/96 (IPv4-mapped)' },
    { pattern: /^100:/, desc: '100::/64 (Discard)' },
    { pattern: /^2001::/, desc: '2001::/32 (Teredo)' },
    { pattern: /^2001:20:/, desc: '2001:20::/28 (ORCHID)' },
    { pattern: /^2001:db8:/, desc: '2001:db8::/32 (Documentation)' },
    { pattern: /^ff/, desc: 'ff00::/8 (Multicast)' },
  ]

  for (const { pattern } of patterns) {
    if (pattern.test(ip)) return true
  }
  return false
}

onMounted(() => {
  loadRoutes()
  loadStats()
})
</script>

<style scoped>
.bgp-panel {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 20px;
}

.bgp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.bgp-header h3 {
  font-size: 18px;
  color: #f1f5f9;
}

.bgp-actions {
  display: flex;
  gap: 8px;
}

.btn {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:hover {
  transform: translateY(-1px);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-secondary {
  background: #334155;
}

.bgp-lookup {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.bgp-lookup input,
.private-ip-info input {
  flex: 1;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px 12px;
  color: #e2e8f0;
  font-size: 14px;
  font-family: 'Monaco', 'Menlo', monospace;
}

.lookup-result {
  background: #0f172a;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.lookup-result.found {
  border-left: 3px solid #22c55e;
}

.lookup-info div {
  margin-bottom: 4px;
  font-size: 13px;
  color: #e2e8f0;
}

.lookup-not-found {
  color: #94a3b8;
  font-size: 14px;
}

.bgp-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.bgp-stats .stat {
  flex: 1;
  background: #0f172a;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}

.bgp-stats .label {
  font-size: 12px;
  color: #94a3b8;
}

.bgp-stats .value {
  font-size: 20px;
  font-weight: 700;
  color: #3b82f6;
}

.bgp-routes h4,
.private-ip-info h4 {
  font-size: 14px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.route-list {
  max-height: 200px;
  overflow-y: auto;
}

.route-item {
  background: #0f172a;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 4px;
  font-size: 12px;
}

.route-prefix {
  font-family: 'Monaco', 'Menlo', monospace;
  color: #60a5fa;
}

.route-asn {
  color: #a78bfa;
  font-size: 11px;
}

.route-nexthop {
  color: #94a3b8;
  font-size: 11px;
}

.no-routes {
  text-align: center;
  padding: 20px;
  color: #64748b;
  font-size: 13px;
}

.private-ip-info {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #334155;
}

.private-ip-info > div {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.ip-check-result {
  font-size: 13px;
}

.ip-private {
  color: #22c55e;
}

.ip-reserved {
  color: #f59e0b;
}

.ip-public {
  color: #3b82f6;
}
</style>
