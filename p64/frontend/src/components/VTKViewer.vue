<template>
  <div class="vtk-viewer">
    <div class="viewer-controls">
      <div class="control-group">
        <label>显示模式:</label>
        <select v-model="displayMode" class="form-input">
          <option value="wireframe">网格线框</option>
          <option value="surface">表面</option>
          <option value="surface_with_edges">带边线表面</option>
        </select>
      </div>
      <div class="control-group">
        <label>显示场:</label>
        <select v-model="fieldType" class="form-input">
          <option value="von_mises">Von Mises应力</option>
          <option value="stress_xx">σ_xx</option>
          <option value="stress_yy">σ_yy</option>
          <option value="stress_xy">τ_xy</option>
          <option value="disp_x">X向位移</option>
          <option value="disp_y">Y向位移</option>
          <option value="disp_mag">位移幅值</option>
        </select>
      </div>
      <div class="control-group">
        <label>变形放大:</label>
        <input 
          v-model.number="warpFactor" 
          type="range" 
          min="0" 
          max="10" 
          step="0.1"
        >
        <span>{{ warpFactor.toFixed(1) }}</span>
      </div>
      <div class="control-group">
        <label>
          <input type="checkbox" v-model="showColorBar">
          显示色标
        </label>
      </div>
    </div>

    <div v-if="transientResults.length > 1" class="animation-controls">
      <div class="playback-controls">
        <button class="play-btn" @click="prevFrame">⏮</button>
        <button class="play-btn" @click="togglePlay">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button class="play-btn" @click="nextFrame">⏭</button>
      </div>
      <div class="timeline">
        <input 
          v-model.number="currentStep" 
          type="range" 
          :min="0" 
          :max="transientResults.length - 1" 
          step="1"
        >
        <span class="step-info">
          步 {{ currentStep + 1 }}/{{ transientResults.length }} 
          (载荷: {{ loadFactor.toFixed(1) }}%)
        </span>
      </div>
      <div class="speed-control">
        <label>速度:</label>
        <select v-model.number="animationSpeed" class="form-input">
          <option :value="500">慢</option>
          <option :value="200">中</option>
          <option :value="100">快</option>
        </select>
      </div>
    </div>

    <div class="tool-controls">
      <button 
        class="tool-btn" 
        :class="{ active: probeMode }"
        @click="probeMode = !probeMode"
      >
        🔍 探针模式
      </button>
      <button class="tool-btn" @click="exportVTU">
        📥 导出VTU
      </button>
      <button class="tool-btn" @click="resetView">
        🔄 重置视图
      </button>
    </div>

    <div 
      ref="containerRef" 
      class="vtk-container"
      :class="{ 'probe-cursor': probeMode }"
      @click="onCanvasClick"
      @mousemove="onCanvasMove"
    ></div>

    <div v-if="probeInfo" class="probe-popup" :style="probePopupStyle">
      <div class="probe-header">
        <span>{{ probeInfo.type }}</span>
        <button @click="probeInfo = null" class="close-btn">×</button>
      </div>
      <div class="probe-content">
        <div v-if="probeInfo.type === '单元'">
          <p><strong>单元ID:</strong> {{ probeInfo.elementId }}</p>
          <p><strong>节点:</strong> {{ probeInfo.nodes.join(', ') }}</p>
          <p><strong>Von Mises:</strong> {{ formatValue(probeInfo.von_mises, 'stress') }}</p>
          <p><strong>σ_xx:</strong> {{ formatValue(probeInfo.stress_xx, 'stress') }}</p>
          <p><strong>σ_yy:</strong> {{ formatValue(probeInfo.stress_yy, 'stress') }}</p>
          <p><strong>τ_xy:</strong> {{ formatValue(probeInfo.stress_xy, 'stress') }}</p>
        </div>
        <div v-else-if="probeInfo.type === '节点'">
          <p><strong>节点ID:</strong> {{ probeInfo.nodeId }}</p>
          <p><strong>坐标:</strong> ({{ probeInfo.x.toFixed(2) }}, {{ probeInfo.y.toFixed(2) }})</p>
          <p><strong>X位移:</strong> {{ formatValue(probeInfo.disp_x, 'disp') }}</p>
          <p><strong>Y位移:</strong> {{ formatValue(probeInfo.disp_y, 'disp') }}</p>
        </div>
      </div>
    </div>

    <div class="color-bar-container" v-if="showColorBar">
      <canvas ref="colorBarRef" class="color-bar"></canvas>
      <div class="color-labels">
        <span>{{ formatValue(minValue, 'auto') }}</span>
        <span>{{ formatValue(maxValue, 'auto') }}</span>
      </div>
      <div class="field-label">{{ fieldLabel }}</div>
    </div>

    <div v-if="hoverInfo" class="hover-info">
      {{ hoverInfo }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

const props = defineProps({
  result: {
    type: Object,
    required: false
  },
  results: {
    type: Array,
    default: () => []
  },
  vtuFile: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['probe'])

const containerRef = ref(null)
const colorBarRef = ref(null)
const displayMode = ref('surface')
const fieldType = ref('von_mises')
const warpFactor = ref(1)
const showColorBar = ref(true)
const probeMode = ref(false)
const probeInfo = ref(null)
const probePopupStyle = ref({ left: '0px', top: '0px' })
const hoverInfo = ref('')

const isPlaying = ref(false)
const currentStep = ref(0)
const animationSpeed = ref(200)
let animationInterval = null

const viewState = ref({
  offsetX: 0,
  offsetY: 0,
  zoom: 1
})

const transientResults = computed(() => {
  if (props.results && props.results.length > 0) {
    return props.results
  }
  if (props.result) {
    return [props.result]
  }
  return []
})

const currentResult = computed(() => {
  if (transientResults.value.length === 0) return null
  return transientResults.value[Math.min(currentStep.value, transientResults.value.length - 1)]
})

const loadFactor = computed(() => {
  if (!currentResult.value) return 0
  return (currentResult.value.load_factor || 1) * 100
})

const fieldLabel = computed(() => {
  const labels = {
    von_mises: 'Von Mises应力 (Pa)',
    stress_xx: 'σ_xx (Pa)',
    stress_yy: 'σ_yy (Pa)',
    stress_xy: 'τ_xy (Pa)',
    disp_x: 'X向位移 (m)',
    disp_y: 'Y向位移 (m)',
    disp_mag: '位移幅值 (m)'
  }
  return labels[fieldType.value] || ''
})

const fieldData = computed(() => {
  if (!currentResult.value) return []
  
  switch (fieldType.value) {
    case 'von_mises':
      return currentResult.value.von_mises || []
    case 'stress_xx':
      return (currentResult.value.stresses || []).map(s => s[0])
    case 'stress_yy':
      return (currentResult.value.stresses || []).map(s => s[1])
    case 'stress_xy':
      return (currentResult.value.stresses || []).map(s => s[2])
    case 'disp_x':
      return (currentResult.value.displacements || []).map(d => d[0])
    case 'disp_y':
      return (currentResult.value.displacements || []).map(d => d[1])
    case 'disp_mag':
      return (currentResult.value.displacements || []).map(d => 
        Math.sqrt(d[0]**2 + d[1]**2)
      )
    default:
      return currentResult.value.von_mises || []
  }
})

const minValue = computed(() => {
  if (!fieldData.value.length) return 0
  return Math.min(...fieldData.value)
})

const maxValue = computed(() => {
  if (!fieldData.value.length) return 1
  return Math.max(...fieldData.value)
})

onMounted(() => {
  initCanvas()
  drawScene()
  drawColorBar()
  initInteraction()
})

onUnmounted(() => {
  stopAnimation()
})

const initCanvas = () => {
  const canvas = document.createElement('canvas')
  containerRef.value.appendChild(canvas)
}

const getCanvas = () => {
  return containerRef.value?.querySelector('canvas')
}

const drawScene = () => {
  const canvas = getCanvas()
  if (!canvas || !currentResult.value) return
  
  const ctx = canvas.getContext('2d')
  const w = canvas.width = containerRef.value.clientWidth
  const h = canvas.height = containerRef.value.clientHeight
  
  ctx.fillStyle = '#f2f2f2'
  ctx.fillRect(0, 0, w, h)
  
  if (!currentResult.value?.elements || !currentResult.value?.nodes) return
  
  const nodes = currentResult.value.nodes
  const displacements = currentResult.value.displacements || []
  const elements = currentResult.value.elements
  
  const allX = nodes.map(n => n[0])
  const allY = nodes.map(n => n[1])
  const minX = Math.min(...allX)
  const maxX = Math.max(...allX)
  const minY = Math.min(...allY)
  const maxY = Math.max(...allY)
  
  const modelW = maxX - minX
  const modelH = maxY - minY
  const scale = Math.min(w, h) / Math.max(modelW, modelH) * 0.8 * viewState.value.zoom
  
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const screenCenterX = w / 2 + viewState.value.offsetX
  const screenCenterY = h / 2 + viewState.value.offsetY
  
  const transformNode = (node, disp) => {
    const x = node[0] + disp[0] * warpFactor.value
    const y = node[1] + disp[1] * warpFactor.value
    return {
      x: screenCenterX + (x - centerX) * scale,
      y: screenCenterY - (y - centerY) * scale
    }
  }
  
  const transformedNodes = nodes.map((node, i) => 
    transformNode(node, displacements[i] || [0, 0])
  )
  
  const data = fieldData.value
  const minV = minValue.value
  const maxV = maxValue.value
  
  elements.forEach((elem, elemIdx) => {
    const value = data[elemIdx] || 0
    const color = getColor(value, minV, maxV)
    
    const [n1, n2, n3] = elem
    const p1 = transformedNodes[n1]
    const p2 = transformedNodes[n2]
    const p3 = transformedNodes[n3]
    
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.lineTo(p3.x, p3.y)
    ctx.closePath()
    
    if (displayMode.value === 'wireframe') {
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 0.5
      ctx.stroke()
    } else {
      ctx.fillStyle = color
      ctx.fill()
      
      if (displayMode.value === 'surface_with_edges') {
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
    }
  })
}

const getColor = (value, min, max) => {
  if (max === min) return 'rgb(127, 127, 255)'
  
  const t = (value - min) / (max - min)
  
  const colors = [
    { r: 0, g: 0, b: 255 },
    { r: 0, g: 255, b: 255 },
    { r: 0, g: 255, b: 0 },
    { r: 255, g: 255, b: 0 },
    { r: 255, g: 0, b: 0 }
  ]
  
  const numColors = colors.length
  const scaledT = t * (numColors - 1)
  const idx = Math.floor(scaledT)
  const frac = scaledT - idx
  
  if (idx >= numColors - 1) {
    const c = colors[numColors - 1]
    return `rgb(${c.r}, ${c.g}, ${c.b})`
  }
  
  const c1 = colors[idx]
  const c2 = colors[idx + 1]
  
  const r = Math.round(c1.r + (c2.r - c1.r) * frac)
  const g = Math.round(c1.g + (c2.g - c1.g) * frac)
  const b = Math.round(c1.b + (c2.b - c1.b) * frac)
  
  return `rgb(${r}, ${g}, ${b})`
}

const drawColorBar = () => {
  if (!colorBarRef.value) return
  
  const canvas = colorBarRef.value
  const ctx = canvas.getContext('2d')
  const w = canvas.width = 30
  const h = canvas.height = 300
  
  const gradient = ctx.createLinearGradient(0, h, 0, 0)
  gradient.addColorStop(0, 'rgb(0, 0, 255)')
  gradient.addColorStop(0.25, 'rgb(0, 255, 255)')
  gradient.addColorStop(0.5, 'rgb(0, 255, 0)')
  gradient.addColorStop(0.75, 'rgb(255, 255, 0)')
  gradient.addColorStop(1, 'rgb(255, 0, 0)')
  
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
}

let isDragging = false
let lastPos = { x: 0, y: 0 }

const initInteraction = () => {
  const canvas = getCanvas()
  if (!canvas) return
  
  canvas.addEventListener('mousedown', (e) => {
    if (probeMode.value) return
    isDragging = true
    lastPos = { x: e.clientX, y: e.clientY }
  })
  
  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging || probeMode.value) return
    viewState.value.offsetX += e.clientX - lastPos.x
    viewState.value.offsetY += e.clientY - lastPos.y
    
    lastPos = { x: e.clientX, y: e.clientY }
    drawScene()
  })
  
  canvas.addEventListener('mouseup', () => {
    isDragging = false
  })
  
  canvas.addEventListener('mouseleave', () => {
    isDragging = false
  })
  
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    viewState.value.zoom *= zoomFactor
    drawScene()
  })
}

const onCanvasClick = (e) => {
  if (!probeMode.value || !currentResult.value) return
  
  const rect = getCanvas().getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const clickY = e.clientY - rect.top
  
  const nodes = currentResult.value.nodes
  const elements = currentResult.value.elements
  const displacements = currentResult.value.displacements || []
  
  const allX = nodes.map(n => n[0])
  const allY = nodes.map(n => n[1])
  const minX = Math.min(...allX)
  const maxX = Math.max(...allX)
  const minY = Math.min(...allY)
  const maxY = Math.max(...allY)
  
  const modelW = maxX - minX
  const modelH = maxY - minY
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  const scale = Math.min(w, h) / Math.max(modelW, modelH) * 0.8 * viewState.value.zoom
  
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const screenCenterX = w / 2 + viewState.value.offsetX
  const screenCenterY = h / 2 + viewState.value.offsetY
  
  const transformNode = (node, disp) => {
    const x = node[0] + disp[0] * warpFactor.value
    const y = node[1] + disp[1] * warpFactor.value
    return {
      x: screenCenterX + (x - centerX) * scale,
      y: screenCenterY - (y - centerY) * scale
    }
  }
  
  const transformedNodes = nodes.map((node, i) => 
    transformNode(node, displacements[i] || [0, 0])
  )
  
  let closestNode = -1
  let minNodeDist = Infinity
  
  transformedNodes.forEach((p, i) => {
    const dist = Math.sqrt((p.x - clickX)**2 + (p.y - clickY)**2)
    if (dist < minNodeDist) {
      minNodeDist = dist
      closestNode = i
    }
  })
  
  const clickRadius = 10 * viewState.value.zoom
  
  if (minNodeDist < clickRadius) {
    const node = nodes[closestNode]
    const disp = displacements[closestNode] || [0, 0]
    probeInfo.value = {
      type: '节点',
      nodeId: closestNode,
      x: node[0],
      y: node[1],
      disp_x: disp[0],
      disp_y: disp[1]
    }
    probePopupStyle.value = {
      left: `${e.clientX - rect.left + 10}px`,
      top: `${e.clientY - rect.top + 10}px`
    }
    emit('probe', probeInfo.value)
    return
  }
  
  let closestElem = -1
  let minElemDist = Infinity
  
  elements.forEach((elem, elemIdx) => {
    const [n1, n2, n3] = elem
    const p1 = transformedNodes[n1]
    const p2 = transformedNodes[n2]
    const p3 = transformedNodes[n3]
    
    const cx = (p1.x + p2.x + p3.x) / 3
    const cy = (p1.y + p2.y + p3.y) / 3
    const dist = Math.sqrt((cx - clickX)**2 + (cy - clickY)**2)
    
    if (dist < minElemDist) {
      minElemDist = dist
      closestElem = elemIdx
    }
  })
  
  if (closestElem >= 0) {
    const elem = elements[closestElem]
    const stresses = currentResult.value.stresses[closestElem] || [0, 0, 0]
    const von_mises = currentResult.value.von_mises[closestElem] || 0
    
    probeInfo.value = {
      type: '单元',
      elementId: closestElem,
      nodes: elem,
      von_mises: von_mises,
      stress_xx: stresses[0],
      stress_yy: stresses[1],
      stress_xy: stresses[2]
    }
    probePopupStyle.value = {
      left: `${e.clientX - rect.left + 10}px`,
      top: `${e.clientY - rect.top + 10}px`
    }
    emit('probe', probeInfo.value)
  }
}

const onCanvasMove = (e) => {
  if (!probeMode.value || !currentResult.value) {
    hoverInfo.value = ''
    return
  }
  
  const rect = getCanvas().getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  
  const nodes = currentResult.value.nodes
  const allX = nodes.map(n => n[0])
  const allY = nodes.map(n => n[1])
  const minX = Math.min(...allX)
  const maxX = Math.max(...allX)
  const minY = Math.min(...allY)
  const maxY = Math.max(...allY)
  
  const modelW = maxX - minX
  const modelH = maxY - minY
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  const scale = Math.min(w, h) / Math.max(modelW, modelH) * 0.8 * viewState.value.zoom
  
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const screenCenterX = w / 2 + viewState.value.offsetX
  const screenCenterY = h / 2 + viewState.value.offsetY
  
  const modelX = (x - screenCenterX) / scale + centerX
  const modelY = -(y - screenCenterY) / scale + centerY
  
  hoverInfo.value = `坐标: (${modelX.toFixed(2)}, ${modelY.toFixed(2)})`
}

const formatValue = (value, type) => {
  if (type === 'stress' || (type === 'auto' && fieldType.value.startsWith('stress') || fieldType.value === 'von_mises')) {
    if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)} GPa`
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)} MPa`
    if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(2)} kPa`
    return `${value.toFixed(2)} Pa`
  } else if (type === 'disp' || (type === 'auto' && fieldType.value.startsWith('disp'))) {
    if (Math.abs(value) >= 1) return `${value.toFixed(3)} m`
    if (Math.abs(value) >= 1e-3) return `${(value * 1e3).toFixed(3)} mm`
    return `${(value * 1e6).toFixed(3)} μm`
  }
  return value.toExponential(2)
}

const resetView = () => {
  viewState.value = { offsetX: 0, offsetY: 0, zoom: 1 }
  drawScene()
}

const togglePlay = () => {
  if (isPlaying.value) {
    stopAnimation()
  } else {
    startAnimation()
  }
}

const startAnimation = () => {
  if (transientResults.value.length <= 1) return
  isPlaying.value = true
  animationInterval = setInterval(() => {
    currentStep.value = (currentStep.value + 1) % transientResults.value.length
    drawScene()
    drawColorBar()
  }, animationSpeed.value)
}

const stopAnimation = () => {
  isPlaying.value = false
  if (animationInterval) {
    clearInterval(animationInterval)
    animationInterval = null
  }
}

const nextFrame = () => {
  if (currentStep.value < transientResults.value.length - 1) {
    currentStep.value++
    drawScene()
    drawColorBar()
  }
}

const prevFrame = () => {
  if (currentStep.value > 0) {
    currentStep.value--
    drawScene()
    drawColorBar()
  }
}

const exportVTU = async () => {
  if (!props.vtuFile) {
    alert('没有可用的VTU文件')
    return
  }
  
  try {
    const response = await axios.get(`/api/results/${props.vtuFile}`, {
      responseType: 'blob'
    })
    
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', props.vtuFile)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  } catch (e) {
    console.error('下载失败', e)
    alert('下载失败')
  }
}

watch([displayMode, fieldType, warpFactor, currentStep, () => props.result, () => props.results], () => {
  if (currentStep.value >= transientResults.value.length) {
    currentStep.value = Math.max(0, transientResults.value.length - 1)
  }
  drawScene()
  drawColorBar()
}, { deep: true })
</script>

<style scoped>
.vtk-viewer {
  display: flex;
  flex: 1;
  position: relative;
}

.viewer-controls, .animation-controls, .tool-controls {
  position: absolute;
  background: white;
  padding: 0.75rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 10;
  display: flex;
  gap: 0.75rem;
  font-size: 0.875rem;
}

.viewer-controls {
  top: 1rem;
  left: 1rem;
  flex-direction: column;
}

.animation-controls {
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.tool-controls {
  top: 1rem;
  right: 1rem;
  flex-direction: column;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.control-group label {
  color: #555;
  white-space: nowrap;
  font-weight: 500;
}

.animation-controls .control-group label {
  color: white;
}

.control-group .form-input {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  width: 120px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.animation-controls .control-group .form-input {
  width: 80px;
}

.control-group input[type="range"] {
  width: 80px;
}

.control-group input[type="checkbox"] {
  margin-right: 0.25rem;
}

.playback-controls {
  display: flex;
  gap: 0.25rem;
}

.play-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: rgba(255,255,255,0.2);
  color: white;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.play-btn:hover {
  background: rgba(255,255,255,0.3);
}

.timeline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 200px;
}

.timeline input[type="range"] {
  flex: 1;
  cursor: pointer;
}

.step-info {
  font-size: 0.75rem;
  white-space: nowrap;
}

.speed-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tool-btn {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
  white-space: nowrap;
}

.tool-btn:hover {
  border-color: #667eea;
  background: #f0f3ff;
}

.tool-btn.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.vtk-container {
  flex: 1;
  width: 100%;
  height: 100%;
}

.vtk-container canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.probe-cursor canvas {
  cursor: crosshair;
}

.probe-popup {
  position: absolute;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 20;
  min-width: 200px;
  max-width: 280px;
}

.probe-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 8px 8px 0 0;
  font-weight: 500;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 1.25rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.probe-content {
  padding: 0.75rem;
}

.probe-content p {
  margin: 0.25rem 0;
  font-size: 0.875rem;
  color: #333;
}

.probe-content strong {
  color: #667eea;
}

.color-bar-container {
  position: absolute;
  right: 2rem;
  top: 50%;
  transform: translateY(-50%);
  background: white;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.color-bar {
  border: 1px solid #ddd;
  border-radius: 4px;
}

.color-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 300px;
  position: absolute;
  right: -60px;
  font-size: 0.75rem;
  color: #666;
}

.field-label {
  font-size: 0.75rem;
  color: #333;
  font-weight: 500;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  position: absolute;
  left: -80px;
  height: 300px;
  display: flex;
  align-items: center;
}

.hover-info {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  background: rgba(0,0,0,0.7);
  color: white;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.875rem;
  z-index: 10;
}
</style>
