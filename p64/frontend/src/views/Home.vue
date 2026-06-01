<template>
  <div class="home-container">
    <div class="main-layout">
      <div class="left-panel">
        <div class="panel-section">
          <h3>📋 仿真案例列表</h3>
          <button class="btn-primary" @click="showCreateModal = true">
            + 新建案例
          </button>
          <div class="simulation-list">
            <div 
              v-for="sim in simulations" 
              :key="sim.id"
              class="simulation-item"
              :class="{ active: selectedSim?.id === sim.id }"
              @click="selectSimulation(sim)"
            >
              <div class="sim-header">
                <span class="sim-name">{{ sim.name }}</span>
                <span class="sim-status" :class="sim.status">{{ sim.status }}</span>
              </div>
              <div class="sim-meta">
                <span>{{ sim.geometry_type }}</span>
                <span>{{ new Date(sim.created_at).toLocaleDateString() }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="center-panel">
        <div class="panel-section canvas-section">
          <h3>🎨 几何绘制</h3>
          <div class="toolbar">
            <button 
              class="tool-btn" 
              :class="{ active: drawTool === 'select' }"
              @click="drawTool = 'select'"
            >选择</button>
            <button 
              class="tool-btn" 
              :class="{ active: drawTool === 'rectangle' }"
              @click="drawTool = 'rectangle'"
            >矩形</button>
            <button 
              class="tool-btn" 
              :class="{ active: drawTool === 'circle' }"
              @click="drawTool = 'circle'"
            >圆形</button>
            <button class="tool-btn" @click="clearCanvas">清除</button>
          </div>
          <canvas 
            ref="canvasRef" 
            class="geometry-canvas"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
          ></canvas>
          <div class="canvas-info" v-if="geometry">
            <span>类型: {{ geometry.type }}</span>
            <span v-if="geometry.type === 'rectangle'">
              尺寸: {{ geometry.width.toFixed(2) }} x {{ geometry.height.toFixed(2) }}
            </span>
            <span v-if="geometry.type === 'circle'">
              半径: {{ geometry.radius.toFixed(2) }}
            </span>
          </div>
        </div>

        <div class="panel-section">
          <h3>🔧 边界条件</h3>
          <div class="bc-list">
            <div v-for="(bc, index) in boundaryConditions" :key="index" class="bc-item">
              <select v-model="bc.edge" class="form-input">
                <option v-for="edge in availableEdges" :value="edge.value">{{ edge.label }}</option>
              </select>
              <select v-model="bc.type" class="form-input">
                <option value="fixed">固定约束</option>
                <option value="force">集中力</option>
              </select>
              <input 
                v-if="bc.type === 'force'"
                v-model.number="bc.value" 
                type="number" 
                class="form-input"
                placeholder="力值"
              >
              <select v-if="bc.type === 'force'" v-model="bc.direction" class="form-input">
                <option value="x">X方向</option>
                <option value="y">Y方向</option>
              </select>
              <button class="btn-danger btn-small" @click="removeBC(index)">删除</button>
            </div>
          </div>
          <button class="btn-secondary" @click="addBC">+ 添加边界条件</button>
        </div>
      </div>

      <div class="right-panel">
        <div class="panel-section">
          <h3>⚙️ 材料属性</h3>
          <div class="form-group">
            <label>弹性模量 E (Pa)</label>
            <input v-model.number="material.E" type="number" class="form-input">
          </div>
          <div class="form-group">
            <label>泊松比 ν</label>
            <input v-model.number="material.nu" type="number" step="0.01" class="form-input">
          </div>
        </div>

        <div class="panel-section">
          <h3>📊 网格设置</h3>
          <div class="form-group">
            <label>网格细化等级</label>
            <input 
              v-model.number="meshRefinement" 
              type="range" 
              min="1" 
              max="5" 
              class="slider"
            >
            <span class="slider-value">{{ meshRefinement }}</span>
          </div>
        </div>

        <div class="panel-section">
          <h3>🚀 仿真控制</h3>
          <div class="form-group">
            <label>案例名称</label>
            <input v-model="simulationName" type="text" class="form-input" placeholder="输入案例名称">
          </div>
          <div class="form-group checkbox-group">
            <label>
              <input type="checkbox" v-model="transientAnalysis">
              动态加载动画
            </label>
          </div>
          <div v-if="transientAnalysis" class="form-group">
            <label>时间步数</label>
            <input v-model.number="numSteps" type="number" min="5" max="30" class="form-input">
          </div>
          <button 
            class="btn-primary btn-large" 
            @click="runSimulation"
            :disabled="!geometry || isRunning"
          >
            {{ isRunning ? '计算中...' : '开始计算' }}
          </button>
        </div>

        <div class="panel-section" v-if="simulationResult">
          <h3>📈 计算结果</h3>
          <div class="result-stats">
            <div class="stat-item">
              <span class="stat-label">节点数</span>
              <span class="stat-value">{{ simulationResult.nodes.length }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">单元数</span>
              <span class="stat-value">{{ simulationResult.elements.length }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">最大Mises应力</span>
              <span class="stat-value">{{ maxVonMises.toExponential(2) }} Pa</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal-content">
        <h3>新建仿真案例</h3>
        <div class="form-group">
          <label>案例名称</label>
          <input v-model="newSimName" type="text" class="form-input" placeholder="输入案例名称">
        </div>
        <div class="form-group">
          <label>描述</label>
          <textarea v-model="newSimDesc" class="form-input" rows="3"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showCreateModal = false">取消</button>
          <button class="btn-primary" @click="createSimulation">创建</button>
        </div>
      </div>
    </div>

    <div v-if="showResultViewer" class="result-viewer">
      <div class="viewer-header">
        <h3>🔍 应力云图</h3>
        <button class="btn-secondary" @click="showResultViewer = false">关闭</button>
      </div>
      <VTKViewer 
        :result="simulationResult" 
        :results="simulationResults"
        :vtu-file="vtuFile" 
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import axios from 'axios'
import VTKViewer from '../components/VTKViewer.vue'

const canvasRef = ref(null)
const simulations = ref([])
const selectedSim = ref(null)
const showCreateModal = ref(false)
const showResultViewer = ref(false)
const newSimName = ref('')
const newSimDesc = ref('')
const simulationName = ref('')

const drawTool = ref('select')
const geometry = ref(null)
const isDrawing = ref(false)
const startPoint = ref({ x: 0, y: 0 })
const tempPoint = ref({ x: 0, y: 0 })

const boundaryConditions = ref([])
const material = ref({ E: 200e9, nu: 0.3 })
const meshRefinement = ref(2)
const isRunning = ref(false)
const simulationResult = ref(null)
const simulationResults = ref([])
const vtuFile = ref('')
const transientAnalysis = ref(false)
const numSteps = ref(10)

const availableEdges = computed(() => {
  if (!geometry.value) return []
  if (geometry.value.type === 'rectangle') {
    return [
      { value: 'left', label: '左边界' },
      { value: 'right', label: '右边界' },
      { value: 'top', label: '上边界' },
      { value: 'bottom', label: '下边界' }
    ]
  } else {
    return [
      { value: 'outer', label: '外边界' },
      { value: 'inner', label: '中心点' }
    ]
  }
})

const maxVonMises = computed(() => {
  if (!simulationResult.value?.von_mises) return 0
  return Math.max(...simulationResult.value.von_mises)
})

onMounted(() => {
  loadSimulations()
  initCanvas()
})

const loadSimulations = async () => {
  try {
    const res = await axios.get('/api/simulations')
    simulations.value = res.data
  } catch (e) {
    console.error('加载案例失败', e)
  }
}

const initCanvas = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.width = canvas.offsetWidth
  canvas.height = canvas.offsetHeight
  drawCanvas()
}

const drawCanvas = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  
  ctx.clearRect(0, 0, w, h)
  
  ctx.strokeStyle = '#eee'
  ctx.lineWidth = 1
  for (let i = 0; i <= 10; i++) {
    ctx.beginPath()
    ctx.moveTo(i * w / 10, 0)
    ctx.lineTo(i * w / 10, h)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * h / 10)
    ctx.lineTo(w, i * h / 10)
    ctx.stroke()
  }
  
  if (geometry.value) {
    ctx.fillStyle = 'rgba(102, 126, 234, 0.3)'
    ctx.strokeStyle = '#667eea'
    ctx.lineWidth = 2
    
    if (geometry.value.type === 'rectangle') {
      ctx.fillRect(geometry.value.x, geometry.value.y, geometry.value.width, geometry.value.height)
      ctx.strokeRect(geometry.value.x, geometry.value.y, geometry.value.width, geometry.value.height)
      
      boundaryConditions.value.forEach(bc => {
        drawBoundaryIndicator(ctx, bc, geometry.value)
      })
    } else if (geometry.value.type === 'circle') {
      ctx.beginPath()
      ctx.arc(geometry.value.center_x, geometry.value.center_y, geometry.value.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      
      boundaryConditions.value.forEach(bc => {
        drawBoundaryIndicator(ctx, bc, geometry.value)
      })
    }
  }
  
  if (isDrawing.value && drawTool.value !== 'select') {
    ctx.strokeStyle = '#764ba2'
    ctx.setLineDash([5, 5])
    
    if (drawTool.value === 'rectangle') {
      const x = Math.min(startPoint.value.x, tempPoint.value.x)
      const y = Math.min(startPoint.value.y, tempPoint.value.y)
      const width = Math.abs(tempPoint.value.x - startPoint.value.x)
      const height = Math.abs(tempPoint.value.y - startPoint.value.y)
      ctx.strokeRect(x, y, width, height)
    } else if (drawTool.value === 'circle') {
      const dx = tempPoint.value.x - startPoint.value.x
      const dy = tempPoint.value.y - startPoint.value.y
      const radius = Math.sqrt(dx * dx + dy * dy)
      ctx.beginPath()
      ctx.arc(startPoint.value.x, startPoint.value.y, radius, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }
}

const drawBoundaryIndicator = (ctx, bc, geom) => {
  ctx.fillStyle = bc.type === 'fixed' ? '#e74c3c' : '#27ae60'
  ctx.strokeStyle = bc.type === 'fixed' ? '#c0392b' : '#229954'
  ctx.lineWidth = 3
  
  if (geom.type === 'rectangle') {
    const { x, y, width, height } = geom
    let points = []
    
    switch (bc.edge) {
      case 'left':
        points = [[x, y], [x, y + height]]
        break
      case 'right':
        points = [[x + width, y], [x + width, y + height]]
        break
      case 'top':
        points = [[x, y], [x + width, y]]
        break
      case 'bottom':
        points = [[x, y + height], [x + width, y + height]]
        break
    }
    
    if (points.length === 2) {
      ctx.beginPath()
      ctx.moveTo(points[0][0], points[0][1])
      ctx.lineTo(points[1][0], points[1][1])
      ctx.stroke()
      
      if (bc.type === 'force') {
        const midX = (points[0][0] + points[1][0]) / 2
        const midY = (points[0][1] + points[1][1]) / 2
        drawArrow(ctx, midX, midY, bc.direction)
      }
    }
  } else if (geom.type === 'circle') {
    const { center_x, center_y, radius } = geom
    
    if (bc.edge === 'outer') {
      ctx.beginPath()
      ctx.arc(center_x, center_y, radius + 2, 0, Math.PI * 2)
      ctx.stroke()
      
      if (bc.type === 'force') {
        drawArrow(ctx, center_x + radius, center_y, bc.direction)
      }
    } else if (bc.edge === 'inner') {
      ctx.beginPath()
      ctx.arc(center_x, center_y, 8, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

const drawArrow = (ctx, x, y, direction) => {
  const size = 15
  ctx.fillStyle = '#27ae60'
  ctx.beginPath()
  
  if (direction === 'x') {
    ctx.moveTo(x + size, y)
    ctx.lineTo(x, y - size / 2)
    ctx.lineTo(x, y + size / 2)
  } else {
    ctx.moveTo(x, y + size)
    ctx.lineTo(x - size / 2, y)
    ctx.lineTo(x + size / 2, y)
  }
  ctx.closePath()
  ctx.fill()
}

const onMouseDown = (e) => {
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  
  if (drawTool.value === 'select') return
  
  isDrawing.value = true
  startPoint.value = { x, y }
  tempPoint.value = { x, y }
}

const onMouseMove = (e) => {
  if (!isDrawing.value) return
  
  const rect = canvasRef.value.getBoundingClientRect()
  tempPoint.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
  drawCanvas()
}

const onMouseUp = (e) => {
  if (!isDrawing.value) return
  isDrawing.value = false
  
  if (drawTool.value === 'rectangle') {
    const x = Math.min(startPoint.value.x, tempPoint.value.x)
    const y = Math.min(startPoint.value.y, tempPoint.value.y)
    const width = Math.abs(tempPoint.value.x - startPoint.value.x)
    const height = Math.abs(tempPoint.value.y - startPoint.value.y)
    
    if (width > 10 && height > 10) {
      geometry.value = { type: 'rectangle', x, y, width, height }
      boundaryConditions.value = []
    }
  } else if (drawTool.value === 'circle') {
    const dx = tempPoint.value.x - startPoint.value.x
    const dy = tempPoint.value.y - startPoint.value.y
    const radius = Math.sqrt(dx * dx + dy * dy)
    
    if (radius > 10) {
      geometry.value = { 
        type: 'circle', 
        center_x: startPoint.value.x, 
        center_y: startPoint.value.y, 
        radius 
      }
      boundaryConditions.value = []
    }
  }
  
  drawCanvas()
}

const clearCanvas = () => {
  geometry.value = null
  boundaryConditions.value = []
  simulationResult.value = null
  drawCanvas()
}

const addBC = () => {
  if (availableEdges.value.length === 0) return
  boundaryConditions.value.push({
    edge: availableEdges.value[0].value,
    type: 'fixed',
    value: 0,
    direction: 'y'
  })
  drawCanvas()
}

const removeBC = (index) => {
  boundaryConditions.value.splice(index, 1)
  drawCanvas()
}

watch(boundaryConditions, () => {
  drawCanvas()
}, { deep: true })

const selectSimulation = (sim) => {
  selectedSim.value = sim
  simulationName.value = sim.name
  geometry.value = { ...sim.geometry_params, type: sim.geometry_type }
  boundaryConditions.value = [...sim.boundary_conditions]
  material.value = { ...sim.material_properties }
  meshRefinement.value = sim.mesh_refinement
  
  setTimeout(drawCanvas, 100)
  
  if (sim.status === 'completed') {
    loadSimulationResult(sim.id)
  }
}

const loadSimulationResult = async (id) => {
  try {
    const res = await axios.post(`/api/simulations/${id}/run`)
    if (res.data.status === 'completed') {
      simulationResult.value = res.data.result
    }
  } catch (e) {
    console.error('加载结果失败', e)
  }
}

const createSimulation = async () => {
  if (!newSimName.value) return
  
  try {
    await axios.post('/api/simulations', {
      name: newSimName.value,
      description: newSimDesc.value,
      geometry_type: 'rectangle',
      geometry_params: { width: 100, height: 50 },
      boundary_conditions: [],
      material_properties: material.value,
      mesh_refinement: meshRefinement.value
    })
    
    showCreateModal.value = false
    newSimName.value = ''
    newSimDesc.value = ''
    loadSimulations()
  } catch (e) {
    console.error('创建失败', e)
  }
}

const runSimulation = async () => {
  if (!geometry.value) return
  
  isRunning.value = true
  
  try {
    const geometryParams = { ...geometry.value }
    delete geometryParams.type
    
    let simId = selectedSim.value?.id
    
    if (!simId) {
      const res = await axios.post('/api/simulations', {
        name: simulationName.value || '未命名仿真',
        geometry_type: geometry.value.type,
        geometry_params: geometryParams,
        boundary_conditions: boundaryConditions.value,
        material_properties: material.value,
        mesh_refinement: meshRefinement.value
      })
      simId = res.data.id
    } else {
      await axios.put(`/api/simulations/${simId}`, {
        name: simulationName.value || '未命名仿真',
        geometry_type: geometry.value.type,
        geometry_params: geometryParams,
        boundary_conditions: boundaryConditions.value,
        material_properties: material.value,
        mesh_refinement: meshRefinement.value
      })
    }
    
    const res = await axios.post(`/api/simulations/${simId}/run`, {
      transient: transientAnalysis.value,
      num_steps: numSteps.value
    })
    
    if (res.data.status === 'completed') {
      simulationResult.value = res.data.result
      simulationResults.value = res.data.results || []
      vtuFile.value = res.data.vtu_file || ''
      showResultViewer.value = true
      loadSimulations()
    }
  } catch (e) {
    console.error('计算失败', e)
    alert('计算失败: ' + (e.response?.data?.error || e.message))
  } finally {
    isRunning.value = false
  }
}
</script>

<style scoped>
.home-container {
  width: 100%;
  height: 100%;
}

.main-layout {
  display: grid;
  grid-template-columns: 280px 1fr 320px;
  gap: 1.5rem;
  height: calc(100vh - 120px);
}

.panel-section {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.panel-section h3 {
  margin-bottom: 1rem;
  color: #333;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.left-panel {
  overflow-y: auto;
}

.simulation-list {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.simulation-item {
  padding: 0.75rem;
  border: 1px solid #eee;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.simulation-item:hover {
  border-color: #667eea;
}

.simulation-item.active {
  border-color: #667eea;
  background: #f0f3ff;
}

.sim-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.sim-name {
  font-weight: 500;
  color: #333;
}

.sim-status {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 10px;
}

.sim-status.completed {
  background: #d4edda;
  color: #155724;
}

.sim-status.running {
  background: #fff3cd;
  color: #856404;
}

.sim-status.pending {
  background: #e2e3e5;
  color: #383d41;
}

.sim-status.failed {
  background: #f8d7da;
  color: #721c24;
}

.sim-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #666;
}

.center-panel {
  overflow-y: auto;
}

.canvas-section {
  height: 500px;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.tool-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  border-color: #667eea;
}

.tool-btn.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.geometry-canvas {
  flex: 1;
  width: 100%;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fafafa;
  cursor: crosshair;
}

.canvas-info {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  color: #666;
}

.bc-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.bc-item {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: #555;
}

.form-group.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.form-group.checkbox-group input {
  cursor: pointer;
}

.form-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
}

.slider {
  width: calc(100% - 50px);
}

.slider-value {
  display: inline-block;
  width: 40px;
  text-align: center;
  font-weight: 600;
  color: #667eea;
}

.btn-primary {
  width: 100%;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: opacity 0.2s;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: #f0f0f0;
  color: #333;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-secondary:hover {
  background: #e0e0e0;
}

.btn-danger {
  padding: 0.375rem 0.75rem;
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.75rem;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.btn-large {
  padding: 1rem;
  font-size: 1rem;
}

.result-stats {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 6px;
}

.stat-label {
  color: #666;
  font-size: 0.875rem;
}

.stat-value {
  font-weight: 600;
  color: #333;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
}

.modal-content h3 {
  margin-bottom: 1.5rem;
  color: #333;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.result-viewer {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: white;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  border-bottom: 1px solid #eee;
  background: #f8f9fa;
}

.viewer-header h3 {
  margin: 0;
}

.bc-item .form-input {
  flex: 1;
  min-width: 80px;
}
</style>
