<template>
  <div class="map-container">
    <div class="map-header">
      <h2>全球地表湿度分布图</h2>
      <div class="legend-container">
        <div class="legend-section">
          <div class="legend-title">土壤湿度</div>
          <div class="legend-item">
            <div class="legend-bar soil-bar"></div>
            <div class="legend-labels">
              <span>0%</span>
              <span>30%</span>
              <span>60%</span>
            </div>
          </div>
        </div>
        <div class="legend-section">
          <div class="legend-title">地表类型</div>
          <div class="type-legend">
            <div class="type-item">
              <span class="type-dot water-dot"></span>
              <span>水体</span>
            </div>
            <div class="type-item">
              <span class="type-dot frozen-dot"></span>
              <span>冻土</span>
            </div>
            <div class="type-item">
              <span class="type-dot unknown-dot"></span>
              <span>未知</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div ref="chartRef" class="chart"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['point-click'])

const chartRef = ref(null)
let chartInstance = null

const SURFACE_COLORS = {
  water: '#1E90FF',
  frozen_soil: '#E0FFFF',
  soil: null,
  unknown: '#808080'
}

const moistureToColor = (moisture) => {
  const colors = [
    [0, '#8B4513'],
    [0.15, '#D2691E'],
    [0.3, '#F4A460'],
    [0.45, '#90EE90'],
    [0.6, '#00CED1']
  ]
  for (let i = 0; i < colors.length - 1; i++) {
    if (moisture <= colors[i + 1][0]) {
      const t = (moisture - colors[i][0]) / (colors[i + 1][0] - colors[i][0])
      return interpolateColor(colors[i][1], colors[i + 1][1], t)
    }
  }
  return colors[colors.length - 1][1]
}

const interpolateColor = (c1, c2, t) => {
  const r1 = parseInt(c1.slice(1, 3), 16)
  const g1 = parseInt(c1.slice(3, 5), 16)
  const b1 = parseInt(c1.slice(5, 7), 16)
  const r2 = parseInt(c2.slice(1, 3), 16)
  const g2 = parseInt(c2.slice(3, 5), 16)
  const b2 = parseInt(c2.slice(5, 7), 16)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r}, ${g}, ${b})`
}

const getSurfaceTypeLabel = (type) => {
  const labels = {
    'soil': '土壤',
    'water': '水体',
    'frozen_soil': '冻土',
    'unknown': '未知'
  }
  return labels[type] || type
}

const getPointColor = (point) => {
  if (point.surface_type === 'water') {
    return SURFACE_COLORS.water
  } else if (point.surface_type === 'frozen_soil') {
    return SURFACE_COLORS.frozen_soil
  } else if (point.surface_type === 'unknown') {
    return SURFACE_COLORS.unknown
  }
  return moistureToColor(point.soil_moisture)
}

const getPointSize = (point) => {
  if (point.surface_type === 'water') {
    return 14
  } else if (point.surface_type === 'frozen_soil') {
    return 10
  }
  return 12
}

const initChart = () => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  
  const gridData = []
  const step = 4
  for (let lat = -60; lat <= 60; lat += step) {
    for (let lon = -180; lon <= 180; lon += step) {
      const nearbyPoints = props.data.filter(p => 
        Math.abs(p.latitude - lat) < step && Math.abs(p.longitude - lon) < step
      )
      if (nearbyPoints.length > 0) {
        const typeCounts = {}
        let totalMoisture = 0
        let soilCount = 0
        
        nearbyPoints.forEach(p => {
          typeCounts[p.surface_type] = (typeCounts[p.surface_type] || 0) + 1
          if (p.surface_type === 'soil') {
            totalMoisture += p.soil_moisture
            soilCount++
          }
        })
        
        const dominantType = Object.keys(typeCounts).reduce((a, b) => 
          typeCounts[a] > typeCounts[b] ? a : b
        )
        
        const avgMoisture = soilCount > 0 ? totalMoisture / soilCount : 0
        
        gridData.push({
          lon: lon,
          lat: lat,
          soil_moisture: avgMoisture,
          surface_type: dominantType,
          point_count: nearbyPoints.length
        })
      }
    }
  }

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        if (params.data) {
          const d = params.data
          return `
            <div style="padding: 8px;">
              <div><strong>经度:</strong> ${d.lon.toFixed(2)}°</div>
              <div><strong>纬度:</strong> ${d.lat.toFixed(2)}°</div>
              <div><strong>地表类型:</strong> ${getSurfaceTypeLabel(d.surface_type)}</div>
              ${d.surface_type === 'soil' ? `<div><strong>土壤湿度:</strong> ${(d.soil_moisture * 100).toFixed(1)}%</div>` : ''}
              <div><strong>数据点数:</strong> ${d.point_count}</div>
            </div>
          `
        }
        return ''
      }
    },
    geo: {
      map: 'world',
      roam: true,
      zoom: 1.2,
      center: [0, 20],
      itemStyle: {
        areaColor: '#1a2440',
        borderColor: '#2d3a5a',
        borderWidth: 1
      },
      emphasis: {
        itemStyle: {
          areaColor: '#2a3a5a'
        },
        label: {
          show: false
        }
      }
    },
    series: [{
      type: 'scatter',
      coordinateSystem: 'geo',
      data: gridData.map(item => ({
        value: [item.lon, item.lat],
        lon: item.lon,
        lat: item.lat,
        soil_moisture: item.soil_moisture,
        surface_type: item.surface_type,
        point_count: item.point_count,
        itemStyle: {
          color: getPointColor(item)
        },
        symbolSize: getPointSize(item)
      })),
      itemStyle: {
        opacity: 0.85
      },
      emphasis: {
        itemStyle: {
          opacity: 1,
          borderColor: '#fff',
          borderWidth: 2
        }
      }
    }]
  }

  chartInstance.setOption(option)
  
  chartInstance.on('click', (params) => {
    if (params.data) {
      emit('point-click', {
        longitude: params.data.lon,
        latitude: params.data.lat,
        surface_type: params.data.surface_type
      })
    }
  })
}

watch(() => props.data, () => {
  nextTick(() => {
    if (chartInstance) {
      chartInstance.dispose()
    }
    initChart()
  })
}, { deep: true })

onMounted(() => {
  fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json')
    .then(response => response.json())
    .then(() => {
      echarts.registerMap('world', {
        type: 'FeatureCollection',
        features: []
      })
      initChart()
    })
    .catch(() => {
      echarts.registerMap('world', {
        type: 'FeatureCollection',
        features: []
      })
      initChart()
    })

  window.addEventListener('resize', () => {
    chartInstance?.resize()
  })
})
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #0f1429 0%, #1a1f3a 100%);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.map-header {
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.map-header h2 {
  font-size: 16px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.legend-container {
  display: flex;
  gap: 20px;
}

.legend-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-title {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.legend-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.soil-bar {
  width: 120px;
  height: 6px;
  background: linear-gradient(90deg, #8B4513, #D2691E, #F4A460, #90EE90, #00CED1);
  border-radius: 3px;
}

.legend-labels {
  display: flex;
  justify-content: space-between;
  width: 120px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
}

.type-legend {
  display: flex;
  gap: 12px;
}

.type-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.type-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.water-dot {
  background: #1E90FF;
}

.frozen-dot {
  background: #E0FFFF;
}

.unknown-dot {
  background: #808080;
}

.chart {
  flex: 1;
  width: 100%;
}
</style>
