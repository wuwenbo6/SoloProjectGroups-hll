<template>
  <div ref="chartRef" class="chart-container"></div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'
import { formatBytes } from '../api.js'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  },
  type: {
    type: String,
    default: 'apps'
  }
})

const chartRef = ref(null)
let chart = null

const chartData = computed(() => {
  if (!props.data || props.data.length === 0) return []
  
  return props.data.map(item => {
    if (props.type === 'apps') {
      return {
        name: item.app_name || `${item.protocol_str}-${item.port}`,
        value: item.bytes,
        packets: item.packets
      }
    } else {
      return {
        name: `${item.src_ip} → ${item.dst_ip}`,
        value: item.bytes,
        packets: item.packets
      }
    }
  }).sort((a, b) => b.value - a.value)
})

const colors = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#06b6d4', '#6366f1', '#f43f5e', '#84cc16', '#f97316',
  '#14b8a6', '#a855f7', '#22c55e', '#eab308', '#ef4444'
]

const initChart = () => {
  if (!chartRef.value) return
  
  chart = echarts.init(chartRef.value, 'dark')
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      backgroundColor: 'rgba(30, 41, 59, 0.95)',
      borderColor: '#334155',
      textStyle: {
        color: '#e2e8f0'
      },
      formatter: (params) => {
        const param = params[0]
        const data = param.data
        return `${param.name}<br/>
                流量: ${formatBytes(data.value)}<br/>
                数据包: ${data.packets.toLocaleString()}`
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      axisLine: {
        lineStyle: {
          color: '#334155'
        }
      },
      axisLabel: {
        color: '#94a3b8',
        formatter: (value) => formatBytes(value)
      },
      splitLine: {
        lineStyle: {
          color: '#1e293b'
        }
      }
    },
    yAxis: {
      type: 'category',
      data: [],
      axisLine: {
        lineStyle: {
          color: '#334155'
        }
      },
      axisLabel: {
        color: '#e2e8f0',
        fontSize: 11,
        formatter: (value) => {
          if (value.length > 25) {
            return value.substring(0, 22) + '...'
          }
          return value
        }
      }
    },
    series: [{
      type: 'bar',
      data: [],
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: (params) => colors[params.dataIndex % colors.length]
      },
      barWidth: '60%'
    }]
  }
  
  chart.setOption(option)
  
  window.addEventListener('resize', () => {
    chart?.resize()
  })
}

watch(chartData, (newData) => {
  if (!chart) return
  
  const sortedData = [...newData].sort((a, b) => b.value - a.value)
  const names = sortedData.map(d => d.name).reverse()
  const values = sortedData.map(d => ({
    value: d.value,
    packets: d.packets
  })).reverse()
  
  chart.setOption({
    yAxis: {
      data: names
    },
    series: [{
      data: values
    }]
  })
}, { deep: true })

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  chart?.dispose()
})
</script>
