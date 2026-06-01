<template>
  <div class="graph-visualization">
    <div class="viz-header">
      <span class="title">Graph Visualization</span>
      <div class="stats">
        <span class="stat">Nodes: {{ displayNodes.length }} / {{ totalNodes }}</span>
        <span class="stat">Edges: {{ displayEdges.length }} / {{ totalEdges }}</span>
        <span v-if="sampled" class="stat sampled">Sampled</span>
        <span v-if="highlightedPath.found" class="stat path">Path: {{ highlightedPath.length }} steps</span>
      </div>
    </div>
    <div class="viz-controls" v-if="totalNodes > 100 || showPathControls">
      <label v-if="totalNodes > 100">
        Display:
        <select v-model="displayLimit" @change="updateDisplay">
          <option :value="50">50 nodes</option>
          <option :value="100">100 nodes</option>
          <option :value="200">200 nodes</option>
          <option :value="500">500 nodes</option>
        </select>
      </label>
      <label v-if="totalNodes > 100">
        <input type="checkbox" v-model="autoPause" :checked="autoPause">
        Auto-pause layout
      </label>
      <button v-if="highlightedPath.found" @click="clearPath" class="clear-path-btn">Clear Path</button>
    </div>
    <div class="viz-container" ref="container">
      <svg ref="svg"></svg>
      <div class="tooltip" ref="tooltip" v-show="tooltip.visible">
        <div class="tooltip-title">{{ tooltip.label }}</div>
        <div class="tooltip-props" v-if="tooltip.properties">
          <div v-for="(value, key) in tooltip.properties" :key="key" class="tooltip-prop">
            <span class="prop-key">{{ key }}:</span>
            <span class="prop-value">{{ value }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import * as d3 from 'd3'

export default {
  name: 'GraphVisualization',
  props: {
    graphData: {
      type: Object,
      default: () => ({ nodes: [], edges: [] })
    },
    highlightedPath: {
      type: Object,
      default: () => ({ found: false, nodeIds: [], edgeIds: [] })
    }
  },
  data() {
    return {
      allNodes: [],
      allEdges: [],
      displayNodes: [],
      displayEdges: [],
      totalNodes: 0,
      totalEdges: 0,
      sampled: false,
      displayLimit: 100,
      autoPause: true,
      tooltip: {
        visible: false,
        label: '',
        properties: null
      },
      simulation: null,
      isPaused: false
    }
  },
  computed: {
    showPathControls() {
      return this.highlightedPath.found
    }
  },
  watch: {
    graphData: {
      deep: true,
      handler() {
        this.allNodes = this.graphData.nodes || []
        this.allEdges = this.graphData.edges || []
        this.totalNodes = this.graphData.totalNodes || this.allNodes.length
        this.totalEdges = this.graphData.totalEdges || this.allEdges.length
        this.sampled = this.graphData.sampled || false
        this.updateDisplay()
      }
    },
    highlightedPath: {
      deep: true,
      handler() {
        this.updateHighlight()
      }
    }
  },
  mounted() {
    this.initSvg()
    this.allNodes = this.graphData.nodes || []
    this.allEdges = this.graphData.edges || []
    this.totalNodes = this.graphData.totalNodes || this.allNodes.length
    this.totalEdges = this.graphData.totalEdges || this.allEdges.length
    this.updateDisplay()
  },
  beforeUnmount() {
    if (this.simulation) {
      this.simulation.stop()
    }
  },
  methods: {
    initSvg() {
      const container = this.$refs.container
      const width = container.clientWidth
      const height = container.clientHeight

      const svg = d3.select(this.$refs.svg)
        .attr('width', width)
        .attr('height', height)

      svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 18)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .append('path')
        .attr('d', 'M 0,-3 L 6,0 L 0,3')
        .attr('fill', '#7f849c')

      svg.append('defs').append('marker')
        .attr('id', 'arrowhead-highlighted')
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 18)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .append('path')
        .attr('d', 'M 0,-3 L 6,0 L 0,3')
        .attr('fill', '#f38ba8')

      this.zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on('zoom', (event) => {
          svg.select('.graph-group').attr('transform', event.transform)
        })

      svg.call(this.zoom)
      svg.append('g').attr('class', 'graph-group')

      const resizeObserver = new ResizeObserver(() => {
        const w = container.clientWidth
        const h = container.clientHeight
        svg.attr('width', w).attr('height', h)
        if (this.simulation) {
          this.simulation.force('center', d3.forceCenter(w / 2, h / 2))
        }
      })
      resizeObserver.observe(container)
    },
    updateDisplay() {
      const container = this.$refs.container
      if (!container) return

      const width = container.clientWidth
      const height = container.clientHeight

      const nodeLimit = Math.min(this.displayLimit, this.allNodes.length)
      this.displayNodes = this.allNodes.slice(0, nodeLimit).map(d => ({ ...d }))

      const visibleIds = new Set(this.displayNodes.map(n => n.id))
      this.displayEdges = this.allEdges
        .filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
        .map(d => ({ ...d }))

      this.renderGraph(width, height)
    },
    getNodeColor(label, isHighlighted) {
      if (isHighlighted) return '#f38ba8'
      const colors = {
        person: '#89b4fa',
        software: '#a6e3a1',
        project: '#f9e2af',
        organization: '#cba6f7',
        place: '#fab387',
        default: '#89dceb'
      }
      return colors[label] || colors.default
    },
    isNodeHighlighted(nodeId) {
      return this.highlightedPath.nodeIds && this.highlightedPath.nodeIds.includes(nodeId)
    },
    isEdgeHighlighted(edgeId) {
      return this.highlightedPath.edgeIds && this.highlightedPath.edgeIds.includes(edgeId)
    },
    updateHighlight() {
      const svg = d3.select(this.$refs.svg)
      const nodeSet = new Set(this.highlightedPath.nodeIds || [])
      const edgeSet = new Set(this.highlightedPath.edgeIds || [])

      svg.selectAll('.node')
        .transition()
        .duration(300)
        .attr('fill', d => this.getNodeColor(d.label, nodeSet.has(d.id)))
        .attr('stroke', d => nodeSet.has(d.id) ? '#f38ba8' : '#1e1e2e')
        .attr('stroke-width', d => nodeSet.has(d.id) ? 3 : 2)

      svg.selectAll('.edge')
        .transition()
        .duration(300)
        .attr('stroke', d => edgeSet.has(d.id) ? '#f38ba8' : '#7f849c')
        .attr('stroke-width', d => edgeSet.has(d.id) ? 3 : 2)
        .attr('stroke-opacity', d => edgeSet.has(d.id) ? 1 : 0.6)
    },
    clearPath() {
      this.$emit('clear-path')
    },
    renderGraph(width, height) {
      const svg = d3.select(this.$refs.svg)
      const graphGroup = svg.select('.graph-group')

      if (this.simulation) {
        this.simulation.stop()
      }

      graphGroup.selectAll('*').remove()

      if (this.displayNodes.length === 0) {
        return
      }

      const isLargeGraph = this.displayNodes.length > 50
      const nodeSet = new Set(this.highlightedPath.nodeIds || [])
      const edgeSet = new Set(this.highlightedPath.edgeIds || [])

      const linkGroup = graphGroup.append('g').attr('class', 'links')
      const nodeGroup = graphGroup.append('g').attr('class', 'nodes')
      const labelGroup = graphGroup.append('g').attr('class', 'labels')

      const link = linkGroup.selectAll('line')
        .data(this.displayEdges)
        .join('line')
        .attr('class', 'edge')
        .attr('stroke', d => edgeSet.has(d.id) ? '#f38ba8' : '#7f849c')
        .attr('stroke-width', d => isLargeGraph ? (edgeSet.has(d.id) ? 2 : 1) : (edgeSet.has(d.id) ? 3 : 2))
        .attr('stroke-opacity', d => edgeSet.has(d.id) ? 1 : (isLargeGraph ? 0.3 : 0.6))

      const nodeRadius = isLargeGraph ? Math.max(4, 12 - this.displayNodes.length / 20) : 20

      const node = nodeGroup.selectAll('circle')
        .data(this.displayNodes)
        .join('circle')
        .attr('class', 'node')
        .attr('r', nodeRadius)
        .attr('fill', d => this.getNodeColor(d.label, nodeSet.has(d.id)))
        .attr('stroke', d => nodeSet.has(d.id) ? '#f38ba8' : '#1e1e2e')
        .attr('stroke-width', d => isLargeGraph ? 1 : (nodeSet.has(d.id) ? 3 : 2))
        .style('cursor', 'grab')

      if (!isLargeGraph) {
        node
          .call(this.drag())
          .on('mouseover', (event, d) => this.showTooltip(event, d))
          .on('mousemove', (event) => this.moveTooltip(event))
          .on('mouseout', () => this.hideTooltip())
      }

      if (!isLargeGraph) {
        labelGroup.selectAll('text')
          .data(this.displayNodes)
          .join('text')
          .attr('class', 'node-label')
          .attr('text-anchor', 'middle')
          .attr('dy', nodeRadius + 15)
          .attr('fill', '#cdd6f4')
          .attr('font-size', '11px')
          .attr('pointer-events', 'none')
          .text(d => {
            const name = d.properties?.name || d.label
            return name.length > 10 ? name.substring(0, 10) + '...' : name
          })
      }

      const chargeStrength = isLargeGraph ? -100 : -300
      const linkDistance = isLargeGraph ? 50 : 100

      this.simulation = d3.forceSimulation(this.displayNodes)
        .force('link', d3.forceLink(this.displayEdges).id(d => d.id).distance(linkDistance).strength(0.5))
        .force('charge', d3.forceManyBody().strength(chargeStrength).distanceMax(200))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(nodeRadius + 5).strength(0.7))

      if (isLargeGraph) {
        this.simulation.alphaDecay(0.05)
      }

      let tickCount = 0
      const maxTicks = this.autoPause && isLargeGraph ? 50 : Infinity

      this.simulation.on('tick', () => {
        tickCount++

        if (this.autoPause && tickCount >= maxTicks && !this.isPaused) {
          this.simulation.stop()
          this.isPaused = true
        }

        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y)

        node
          .attr('cx', d => d.x)
          .attr('cy', d => d.y)

        if (!isLargeGraph) {
          labelGroup.selectAll('text')
            .attr('x', d => d.x)
            .attr('y', d => d.y)
        }
      })
    },
    drag() {
      const that = this
      return d3.drag()
        .on('start', function(event, d) {
          if (!event.active) that.simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
          d3.select(this).style('cursor', 'grabbing')
        })
        .on('drag', function(event, d) {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', function(event, d) {
          if (!event.active) that.simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
          d3.select(this).style('cursor', 'grab')
        })
    },
    showTooltip(event, d) {
      this.tooltip = {
        visible: true,
        label: `${d.label} (${d.id})`,
        properties: d.properties
      }
      this.moveTooltip(event)
    },
    moveTooltip(event) {
      const tooltip = this.$refs.tooltip
      if (tooltip) {
        tooltip.style.left = (event.offsetX + 15) + 'px'
        tooltip.style.top = (event.offsetY + 15) + 'px'
      }
    },
    hideTooltip() {
      this.tooltip.visible = false
    }
  }
}
</script>

<style scoped>
.graph-visualization {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #313244;
  border-radius: 8px;
  overflow: hidden;
}

.viz-header {
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

.stats {
  display: flex;
  gap: 12px;
}

.stat {
  font-size: 12px;
  color: #a6adc8;
  padding: 2px 8px;
  background: #585b70;
  border-radius: 4px;
}

.stat.sampled {
  background: #fab387;
  color: #1e1e2e;
}

.stat.path {
  background: #f38ba8;
  color: #1e1e2e;
}

.viz-controls {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  background: #45475a;
  border-bottom: 1px solid #585b70;
  font-size: 12px;
  color: #a6adc8;
  align-items: center;
}

.viz-controls select {
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #585b70;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
}

.viz-controls label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.viz-controls input[type="checkbox"] {
  width: 14px;
  height: 14px;
}

.clear-path-btn {
  background: #f38ba8;
  color: #1e1e2e;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.clear-path-btn:hover {
  background: #eba0ac;
}

.viz-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #1e1e2e;
}

svg {
  display: block;
}

.node {
  transition: fill 0.1s;
}

.node:hover {
  filter: brightness(1.2);
}

.edge {
  transition: stroke 0.1s;
}

.tooltip {
  position: absolute;
  background: #45475a;
  border: 1px solid #585b70;
  border-radius: 8px;
  padding: 12px;
  pointer-events: none;
  z-index: 100;
  max-width: 250px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.tooltip-title {
  font-weight: 600;
  color: #cdd6f4;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #585b70;
}

.tooltip-props {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tooltip-prop {
  font-size: 12px;
}

.prop-key {
  color: #a6adc8;
  margin-right: 4px;
}

.prop-value {
  color: #cdd6f4;
}
</style>
