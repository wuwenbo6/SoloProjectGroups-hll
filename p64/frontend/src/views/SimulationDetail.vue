<template>
  <div class="detail-container">
    <div class="detail-header">
      <button class="btn-secondary" @click="goBack">← 返回</button>
      <h2>{{ simulation?.name || '加载中...' }}</h2>
      <div class="header-actions">
        <button class="btn-primary" @click="runSimulation" :disabled="isRunning">
          {{ isRunning ? '重新计算中...' : '重新计算' }}
        </button>
        <button class="btn-danger" @click="deleteSimulation">删除</button>
      </div>
    </div>
    
    <div v-if="simulation" class="detail-content">
      <div class="info-panel">
        <div class="panel-section">
          <h3>📋 基本信息</h3>
          <div class="info-row">
            <span class="label">状态:</span>
            <span class="value status" :class="simulation.status">{{ simulation.status }}</span>
          </div>
          <div class="info-row">
            <span class="label">创建时间:</span>
            <span class="value">{{ new Date(simulation.created_at).toLocaleString() }}</span>
          </div>
          <div class="info-row">
            <span class="label">几何类型:</span>
            <span class="value">{{ simulation.geometry_type }}</span>
          </div>
          <div class="info-row">
            <span class="label">网格细化:</span>
            <span class="value">{{ simulation.mesh_refinement }}级</span>
          </div>
        </div>
        
        <div class="panel-section" v-if="simulationResult">
          <h3>📊 结果统计</h3>
          <div class="info-row">
            <span class="label">节点数:</span>
            <span class="value">{{ simulationResult.nodes.length }}</span>
          </div>
          <div class="info-row">
            <span class="label">单元数:</span>
            <span class="value">{{ simulationResult.elements.length }}</span>
          </div>
          <div class="info-row">
            <span class="label">最大Von Mises应力:</span>
            <span class="value">{{ maxVonMises.toExponential(2) }} Pa</span>
          </div>
        </div>
      </div>
      
      <div class="viewer-panel">
        <div v-if="simulationResult" class="viewer-wrapper">
          <VTKViewer 
            :result="simulationResult" 
            :results="simulationResults"
            :vtu-file="vtuFile" 
          />
        </div>
        <div v-else class="no-result">
          <p>暂无计算结果</p>
          <div class="simulation-options">
            <label>
              <input type="checkbox" v-model="transientAnalysis">
              动态加载动画
            </label>
            <input 
              v-if="transientAnalysis"
              v-model.number="numSteps" 
              type="number" 
              min="5" 
              max="30" 
              class="form-input"
              placeholder="步数"
            >
          </div>
          <button class="btn-primary" @click="runSimulation" :disabled="isRunning">
            {{ isRunning ? '计算中...' : '开始计算' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import VTKViewer from '../components/VTKViewer.vue'

const route = useRoute()
const router = useRouter()

const simulation = ref(null)
const simulationResult = ref(null)
const simulationResults = ref([])
const vtuFile = ref('')
const isRunning = ref(false)
const transientAnalysis = ref(false)
const numSteps = ref(10)

const maxVonMises = computed(() => {
  if (!simulationResult.value?.von_mises) return 0
  return Math.max(...simulationResult.value.von_mises)
})

onMounted(() => {
  loadSimulation()
})

const loadSimulation = async () => {
  try {
    const res = await axios.get(`/api/simulations/${route.params.id}`)
    simulation.value = res.data
    
    if (simulation.value.status === 'completed') {
      loadResult()
    }
  } catch (e) {
    console.error('加载失败', e)
  }
}

const loadResult = async () => {
  try {
    const res = await axios.post(`/api/simulations/${route.params.id}/run`)
    if (res.data.status === 'completed') {
      simulationResult.value = res.data.result
      simulationResults.value = res.data.results || []
      vtuFile.value = res.data.vtu_file || ''
    }
  } catch (e) {
    console.error('加载结果失败', e)
  }
}

const runSimulation = async () => {
  isRunning.value = true
  
  try {
    const res = await axios.post(`/api/simulations/${route.params.id}/run`, {
      transient: transientAnalysis.value,
      num_steps: numSteps.value
    })
    if (res.data.status === 'completed') {
      simulationResult.value = res.data.result
      simulationResults.value = res.data.results || []
      vtuFile.value = res.data.vtu_file || ''
      simulation.value.status = 'completed'
    }
  } catch (e) {
    console.error('计算失败', e)
    alert('计算失败')
  } finally {
    isRunning.value = false
  }
}

const deleteSimulation = async () => {
  if (!confirm('确定要删除此仿真案例吗？')) return
  
  try {
    await axios.delete(`/api/simulations/${route.params.id}`)
    router.push('/')
  } catch (e) {
    console.error('删除失败', e)
  }
}

const goBack = () => {
  router.push('/')
}
</script>

<style scoped>
.detail-container {
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #eee;
}

.detail-header h2 {
  flex: 1;
  margin: 0;
  color: #333;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.detail-content {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 1.5rem;
  overflow: hidden;
}

.info-panel {
  overflow-y: auto;
}

.viewer-panel {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.viewer-wrapper {
  width: 100%;
  height: 100%;
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

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f0f0f0;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row .label {
  color: #666;
}

.info-row .value {
  font-weight: 500;
  color: #333;
}

.info-row .value.status {
  padding: 0.125rem 0.5rem;
  border-radius: 10px;
  font-size: 0.75rem;
}

.status.completed {
  background: #d4edda;
  color: #155724;
}

.status.running {
  background: #fff3cd;
  color: #856404;
}

.status.pending {
  background: #e2e3e5;
  color: #383d41;
}

.status.failed {
  background: #f8d7da;
  color: #721c24;
}

.no-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  gap: 1rem;
}

.simulation-options {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.simulation-options label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
}

.simulation-options .form-input {
  width: 100px;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.875rem;
}

.btn-primary {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
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
  padding: 0.5rem 1rem;
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-danger:hover {
  background: #c0392b;
}
</style>
