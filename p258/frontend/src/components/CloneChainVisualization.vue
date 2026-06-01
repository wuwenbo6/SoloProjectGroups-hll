<template>
  <div class="chain-container" ref="containerRef">
    <div class="chain-controls">
      <el-radio-group v-model="layoutMode" size="small">
        <el-radio-button value="horizontal">水平布局</el-radio-button>
        <el-radio-button value="vertical">垂直布局</el-radio-button>
      </el-radio-group>
    </div>
    <svg ref="svgRef" class="chain-svg"></svg>
    <div v-if="tooltip.show" class="tooltip" :style="tooltip.style">
      <div class="label">{{ tooltip.data.name }}</div>
      <div class="value">类型: {{ typeLabel(tooltip.data.type) }}</div>
      <div class="value" v-if="tooltip.data.size">大小: {{ formatSize(tooltip.data.size) }}</div>
      <div class="value" v-if="tooltip.data.parent">
        来源: {{ tooltip.data.parent.image }}@{{ tooltip.data.parent.snapshot }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  chainData: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['node-click'])

const containerRef = ref(null)
const svgRef = ref(null)
const layoutMode = ref('horizontal')
const tooltip = ref({
  show: false,
  style: {},
  data: {}
})

const typeLabel = (type) => {
  const labels = {
    image: '原始镜像',
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

const flattenTree = (node, parent = null, depth = 0, result = []) => {
  result.push({ ...node, depth, parent })
  if (node.children) {
    node.children.forEach(child => {
      flattenTree(child, node, depth + 1, result)
    })
  }
  return result
}

const buildChains = () => {
  const chains = []
  const visited = new Set()

  const traverse = (node, chain = []) => {
    if (visited.has(node.id)) return

    const newChain = [...chain, node]
    visited.add(node.id)

    if (!node.children || node.children.length === 0 ||
        !node.children.some(c => c.type === 'clone')) {
      chains.push(newChain)
      return
    }

    node.children.forEach(child => {
      if (child.type === 'clone') {
        traverse(child, newChain)
      } else if (child.children) {
        child.children.forEach(grandChild => {
          if (grandChild.type === 'clone') {
            traverse(grandChild, [...newChain, child])
          }
        })
      }
    })
  }

  props.chainData.forEach(root => {
    if (root.type === 'image') {
      traverse(root)
    }
  })

  return chains
}

const renderChain = async () => {
  if (!svgRef.value || !props.chainData || props.chainData.length === 0) return

  await nextTick()

  const container = containerRef.value
  const width = container.clientWidth - 40
  const height = Math.max(600, container.clientHeight - 80)

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  svg.attr('width', width).attr('height', height)

  const g = svg.append('g').attr('transform', 'translate(40, 40)')

  const zoom = d3.zoom()
    .scaleExtent([0.5, 2])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    })

  svg.call(zoom)

  const chains = buildChains()

  if (layoutMode.value === 'horizontal') {
    renderHorizontal(g, chains, width, height)
  } else {
    renderVertical(g, chains, width, height)
  }
}

const renderHorizontal = (g, chains, width, height) => {
  const nodeWidth = 140
  const nodeHeight = 50
  const chainGap = 80
  const nodeGap = 40

  chains.forEach((chain, chainIndex) => {
    const baseY = chainIndex * (nodeHeight + chainGap) + 50

    chain.forEach((node, nodeIndex) => {
      const x = nodeIndex * (nodeWidth + nodeGap) + 20
      const y = baseY

      if (nodeIndex > 0) {
        const prevX = (nodeIndex - 1) * (nodeWidth + nodeGap) + 20 + nodeWidth
        const prevY = baseY + nodeHeight / 2

        g.append('path')
          .attr('class', 'link')
          .attr('d', `M${prevX},${prevY} L${x},${y + nodeHeight / 2}`)
          .attr('marker-end', 'url(#arrowhead)')
      }

      const nodeG = g.append('g')
        .attr('class', d => `tree-node node-${node.type}`)
        .attr('transform', `translate(${x},${y})`)
        .on('click', () => emit('node-click', node))
        .on('mouseenter', (event) => showTooltip(event, node))
        .on('mousemove', moveTooltip)
        .on('mouseleave', hideTooltip)

      nodeG.append('rect')
        .attr('width', nodeWidth)
        .attr('height', nodeHeight)
        .attr('rx', 8)
        .attr('ry', 8)
        .attr('class', `node-${node.type}`)
        .attr('fill-opacity', 0.8)
        .attr('stroke', node.has_warning ? '#f56c6c' : '#fff')
        .attr('stroke-width', node.has_warning ? 4 : 2)

      nodeG.append('text')
        .attr('x', nodeWidth / 2)
        .attr('y', node.has_warning || (node.type === 'clone' && node.depth > 0) ? 18 : 22)
        .attr('text-anchor', 'middle')
        .attr('fill', '#fff')
        .attr('font-size', '12px')
        .attr('font-weight', '500')
        .text(node.name.length > 12 ? node.name.slice(0, 12) + '...' : node.name)

      let textOffset = 32
      if (node.has_warning) {
        nodeG.append('text')
          .attr('x', nodeWidth / 2)
          .attr('y', textOffset)
          .attr('text-anchor', 'middle')
          .attr('fill', '#ffebee')
          .attr('font-size', '9px')
          .attr('font-weight', 'bold')
          .text('[深度警告]')
        textOffset += 12
      }
      if (node.type === 'clone' && node.depth > 0) {
        nodeG.append('text')
          .attr('x', nodeWidth / 2)
          .attr('y', textOffset)
          .attr('text-anchor', 'middle')
          .attr('fill', 'rgba(255,255,255,0.9)')
          .attr('font-size', '10px')
          .text(`深度: ${node.depth}层`)
        textOffset += 12
      }
      if (!node.has_warning && !(node.type === 'clone' && node.depth > 0)) {
        nodeG.append('text')
          .attr('x', nodeWidth / 2)
          .attr('y', textOffset)
          .attr('text-anchor', 'middle')
          .attr('fill', 'rgba(255,255,255,0.8)')
          .attr('font-size', '10px')
          .text(typeLabel(node.type))
      }
    })
  })

  const defs = svgRef.value ? g.append('defs') : null
  if (defs) {
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('markerWidth', 10)
      .attr('markerHeight', 10)
      .attr('refX', 9)
      .attr('refY', 3)
      .attr('orient', 'auto')
      .append('polygon')
      .attr('points', '0 0, 10 3, 0 6')
      .attr('fill', '#999')
  }
}

const renderVertical = (g, chains, width, height) => {
  const nodeWidth = 140
  const nodeHeight = 50
  const chainGap = 60
  const nodeGap = 40

  chains.forEach((chain, chainIndex) => {
    const baseX = chainIndex * (nodeWidth + chainGap) + 50

    chain.forEach((node, nodeIndex) => {
      const x = baseX
      const y = nodeIndex * (nodeHeight + nodeGap) + 20

      if (nodeIndex > 0) {
        const prevX = baseX + nodeWidth / 2
        const prevY = (nodeIndex - 1) * (nodeHeight + nodeGap) + 20 + nodeHeight

        g.append('path')
          .attr('class', 'link')
          .attr('d', `M${prevX},${prevY} L${x + nodeWidth / 2},${y}`)
      }

      const nodeG = g.append('g')
        .attr('class', d => `tree-node node-${node.type}`)
        .attr('transform', `translate(${x},${y})`)
        .on('click', () => emit('node-click', node))
        .on('mouseenter', (event) => showTooltip(event, node))
        .on('mousemove', moveTooltip)
        .on('mouseleave', hideTooltip)

      nodeG.append('rect')
        .attr('width', nodeWidth)
        .attr('height', nodeHeight)
        .attr('rx', 8)
        .attr('ry', 8)
        .attr('class', `node-${node.type}`)
        .attr('fill-opacity', 0.8)
        .attr('stroke', node.has_warning ? '#f56c6c' : '#fff')
        .attr('stroke-width', node.has_warning ? 4 : 2)

      nodeG.append('text')
        .attr('x', nodeWidth / 2)
        .attr('y', node.has_warning || (node.type === 'clone' && node.depth > 0) ? 18 : 22)
        .attr('text-anchor', 'middle')
        .attr('fill', '#fff')
        .attr('font-size', '12px')
        .attr('font-weight', '500')
        .text(node.name.length > 12 ? node.name.slice(0, 12) + '...' : node.name)

      let textOffset = 32
      if (node.has_warning) {
        nodeG.append('text')
          .attr('x', nodeWidth / 2)
          .attr('y', textOffset)
          .attr('text-anchor', 'middle')
          .attr('fill', '#ffebee')
          .attr('font-size', '9px')
          .attr('font-weight', 'bold')
          .text('[深度警告]')
        textOffset += 12
      }
      if (node.type === 'clone' && node.depth > 0) {
        nodeG.append('text')
          .attr('x', nodeWidth / 2)
          .attr('y', textOffset)
          .attr('text-anchor', 'middle')
          .attr('fill', 'rgba(255,255,255,0.9)')
          .attr('font-size', '10px')
          .text(`深度: ${node.depth}层`)
        textOffset += 12
      }
      if (!node.has_warning && !(node.type === 'clone' && node.depth > 0)) {
        nodeG.append('text')
          .attr('x', nodeWidth / 2)
          .attr('y', textOffset)
          .attr('text-anchor', 'middle')
          .attr('fill', 'rgba(255,255,255,0.8)')
          .attr('font-size', '10px')
          .text(typeLabel(node.type))
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

watch(() => props.chainData, () => {
  renderChain()
}, { deep: true })

watch(layoutMode, () => {
  renderChain()
})

let resizeObserver = null

onMounted(() => {
  renderChain()
  resizeObserver = new ResizeObserver(() => {
    renderChain()
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
.chain-container {
  width: 100%;
  height: 100%;
  min-height: 600px;
  position: relative;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.chain-controls {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.95);
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.chain-svg {
  display: block;
}
</style>
