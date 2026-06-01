<template>
  <div ref="chartRef" class="chart-container"></div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { formatBytes } from '../api.js'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  }
})

const chartRef = ref(null)
let chart = null

const initChart = () => {
  if (!chartRef.value) return
  
  chart = echarts.init(chartRef.value, 'dark')
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(30, 41, 59, 0.95)',
      borderColor: '#334155',
      textStyle: {
        color: '#e2e8f0'
      },
      formatter: (params) => {
        let result = params[0].axisValue + '<br/>'
        params.forEach(param => {
          let value = param.value
          if (param.seriesName === '流量') {
            value = formatBytes(value)
          }
          result += `${param.marker}${param.seriesName}: ${value}<br/>`
        })
        return result
      }
    },
    legend: {
      data: ['流量', '数据包'],
      textStyle: {
        color: '#94a3b8'
      },
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: [],
      axisLine: {
        lineStyle: {
          color: '#334155'
        }
      },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '流量',
        position: 'left',
        axisLine: {
          lineStyle: {
            color: '#3b82f6'
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
      {
        type: 'value',
        name: '数据包',
        position: 'right',
        axisLine: {
          lineStyle: {
            color: '#8b5cf6'
          }
        },
        axisLabel: {
          color: '#94a3b8',
          formatter: (value) => {
            if (value >= 1000) return (value / 1000).toFixed(0) + 'K'
            return value
          }
        },
        splitLine: {
          show: false
        }
      }
    ],
    series: [
      {
        name: '流量',
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: [],
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
          ])
        },
        lineStyle: {
          color: '#3b82f6',
          width: 2
        },
        itemStyle: {
          color: '#3b82f6'
        }
      },
      {
        name: '数据包',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: [],
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(139, 92, 246, 0.3)' },
            { offset: 1, color: 'rgba(139, 92, 246, 0.05)' }
          ])
        },
        lineStyle: {
          color: '#8b5cf6',
          width: 2
        },
        itemStyle: {
          color: '#8b5cf6'
        }
      }
    ]
  }
  
  chart.setOption(option)
  
  window.addEventListener('resize', () => {
    chart?.resize()
  })
}

watch(() => props.data, (newData) => {
  if (!chart || !newData) return
  
  const times = newData.map(d => d.time)
  const bytes = newData.map(d => d.bytes)
  const packets = newData.map(d => d.packets)
  
  chart.setOption({
    xAxis: {
      data: times
    },
    series: [
      { data: bytes },
      { data: packets }
    ]
  })
}, { deep: true })

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  chart?.dispose()
})
</script>
