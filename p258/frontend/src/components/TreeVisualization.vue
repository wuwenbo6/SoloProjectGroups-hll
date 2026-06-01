<template>
  <div class="tree-container" ref="containerRef">
    <div class="tree-legend">
      <div class="legend-item">
        <span class="legend-dot node-image"></span>
        <span>镜像 (Image)</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot node-snapshot"></span>
        <span>快照 (Snapshot)</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot node-clone"></span>
        <span>克隆 (Clone)</span>
      </div>
    </div>
    <svg ref="svgRef" class="tree-svg"></svg>
    <div v-if="tooltip.show" class="tooltip" :style="tooltip.style">
      <div class="label">{{ tooltip.data.name }}</div>
      <div class="value">类型: {{ typeLabel(tooltip.data.type) }}</div>
      <div class="value" v-if="tooltip.data.size">大小: {{ formatSize(tooltip.data.size) }}</div>
      <div class="value" v-if="tooltip.data.timestamp">时间: {{ tooltip.data.timestamp }}</div>
      <div class="value" v-if="tooltip.data.is_protected !== undefined">
        保护状态: {{ tooltip.data.is_protected ? '已保护' : '未保护' }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  treeData: {
    type: Array,
    default: () => []
  },
  mode: {
    type: String,
    default: 'tree'
  }
})

const emit = defineEmits(['node-click'])

const containerRef = ref(null)
const svgRef = ref(null)
const tooltip = ref({
  show: false,
  style: {},
  data: {}
})

const typeLabel = (type) => {
  const labels = {
    image: '镜像',
    snapshot: '快照',
    clone: '克隆'
  }
  return labels[type] || type
}

const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return size.toFixed(2) + ' ' + units[unitIndex]
}

const renderTree = async () => {
  if (!svgRef.value || !props.treeData || props.treeData.length === 0) return

  await nextTick()

  const container = containerRef.value
  const width = container.clientWidth - 40
  const height = Math.max(600, container.clientHeight - 60)

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  svg.attr('width', width).attr('height', height)

  const g = svg.append('g').attr('transform', 'translate(40, 20)')

  const zoom = d3.zoom()
    .scaleExtent([0.3, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    })

  svg.call(zoom)

  const treeLayout = d3.tree().size([height - 80, width - 160])

  props.treeData.forEach((root, treeIndex) => {
    const hierarchy = d3.hierarchy(root, d => d.children)

    if (props.mode === 'radial') {
      const radialLayout = d3.tree()
        .size([2 * Math.PI, Math.min(width, height) / 3])
        .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth)

      radialLayout(hierarchy)

      hierarchy.descendants().forEach(d => {
        d.y = d.depth * 150
      })
    } else {
      treeLayout(hierarchy)
      hierarchy.descendants().forEach(d => {
        d.x += treeIndex * 80
      })
    }

    const links = g.selectAll(`.link-${treeIndex}`)
      .data(hierarchy.links())
      .enter()
      .append('path')
      .attr('class', d => `link ${d.target.data.type === 'clone' ? 'link-clone' : ''}`)
      .attr('d', d => {
        if (props.mode === 'radial') {
          return `M${d.source.y},${d.source.x}
                  C${(d.source.y + d.target.y) / 2},${d.source.x}
                   ${(d.source.y + d.target.y) / 2},${d.target.x}
                   ${d.target.y},${d.target.x}`
        }
        return `M${d.source.y},${d.source.x}
                C${(d.source.y + d.target.y) / 2},${d.source.x}
                 ${(d.source.y + d.target.y) / 2},${d.target.x}
                 ${d.target.y},${d.target.x}`
      })

    const nodes = g.selectAll(`.node-${treeIndex}`)
      .data(hierarchy.descendants())
      .enter()
      .append('g')
      .attr('class', d => `tree-node node-${d.data.type}`)
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .on('click', (event, d) => {
        emit('node-click', d.data)
      })
      .on('mouseenter', (event, d) => {
        showTooltip(event, d.data)
      })
      .on('mousemove', moveTooltip)
      .on('mouseleave', hideTooltip)

    nodes.append('circle')
      .attr('r', d => d.data.type === 'image' ? 18 : d.data.type === 'clone' ? 14 : 12)
      .attr('class', d => `node-${d.data.type}`)
      .attr('stroke', d => d.data.has_warning ? '#f56c6c' : '#fff')
      .attr('stroke-width', d => d.data.has_warning ? 4 : 2)

    nodes.append('text')
      .attr('dy', d => d.data.type === 'image' ? -28 : -22)
      .attr('text-anchor', 'middle')
      .attr('class', 'node-label')
      .text(d => d.data.name)
      .each(function(d) {
        let offset = 0
        if (d.data.type === 'snapshot' && d.data.is_protected) {
          d3.select(this).append('tspan')
            .attr('x', 0)
            .attr('dy', 14)
            .attr('fill', '#67c23a')
            .attr('font-size', 10)
            .text('[已保护]')
          offset = 14
        }
        if (d.data.has_warning) {
          d3.select(this).append('tspan')
            .attr('x', 0)
            .attr('dy', offset || 14)
            .attr('fill', '#f56c6c')
            .attr('font-size', 10)
            .text('[深度警告]')
        }
        if (d.data.type === 'clone' && d.data.depth > 0) {
          d3.select(this).append('tspan')
            .attr('x', 0)
            .attr('dy', 14)
            .attr('fill', '#909399')
            .attr('font-size', 9)
            .text(`(深度: ${d.data.depth})`)
        }
      })
  })
}

const showTooltip = (event, data) => {
  tooltip.value = {
    show: true,
    data: data,
    style: {
      left: (event.pageX + 15) + 'px',
      top: (event.pageY + 15) + 'px'
    }
  }
}

const moveTooltip = (event) => {
  tooltip.value.style = {
    ...tooltip.value.style,
    left: (event.pageX + 15) + 'px',
    top: (event.pageY + 15) + 'px'
  }
}

const hideTooltip = () => {
  tooltip.value.show = false
}

watch(() => props.treeData, () => {
  renderTree()
}, { deep: true })

watch(() => props.mode, () => {
  renderTree()
})

let resizeObserver = null

onMounted(() => {
  renderTree()
  resizeObserver = new ResizeObserver(() => {
    renderTree()
  })
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
})
</script>

<style scoped>
.tree-container {
  width: 100%;
  height: 100%;
  min-height: 600px;
  position: relative;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.tree-legend {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.legend-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 8px;
}

.tree-svg {
  display: block;
}
</style>
