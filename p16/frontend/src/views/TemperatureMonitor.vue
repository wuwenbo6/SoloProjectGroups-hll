<template>
  <div class="temperature-monitor">
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>温度告警</span>
              <el-badge :value="alerts.length" :hidden="alerts.length === 0" class="item">
                <el-button type="danger" size="small" @click="loadAlerts">
                  <el-icon><Bell /></el-icon>
                  刷新
                </el-button>
              </el-badge>
            </div>
          </template>
          
          <div v-if="alerts.length > 0">
            <el-alert
              v-for="alert in alerts"
              :key="alert.produceId"
              :title="`${alert.produceName} - 温度超标!`"
              type="error"
              :description="`产品ID: ${alert.produceId}, 当前温度: ${alert.temperature}°C, 地点: ${alert.location}`"
              show-icon
              closable
              style="margin-bottom: 10px;"
            />
          </div>
          <el-empty v-else description="暂无温度告警" />
        </el-card>
      </el-col>
      
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>记录温度</span>
          </template>
          
          <el-form :model="tempForm" label-width="100px">
            <el-form-item label="选择产品">
              <el-select v-model="tempForm.produceId" style="width: 100%" filterable placeholder="请选择产品">
                <el-option 
                  v-for="produce in produces" 
                  :key="produce.id" 
                  :label="`${produce.name} - ${produce.batchNumber}`"
                  :value="produce.id"
                />
              </el-select>
            </el-form-item>
            
            <el-form-item label="温度(°C)">
              <el-input-number 
                v-model="tempForm.temperature" 
                :step="0.1" 
                :precision="1"
                :min="-50"
                :max="100"
                style="width: 100%"
              />
              <div v-if="tempForm.temperature > 8" style="margin-top: 10px;">
                <el-tag type="danger">温度超过8°C将触发告警!</el-tag>
              </div>
            </el-form-item>
            
            <el-form-item label="地点">
              <el-input v-model="tempForm.location" placeholder="如：冷藏仓库A区" />
            </el-form-item>
            
            <el-form-item label="采集人">
              <el-input v-model="tempForm.reader" />
            </el-form-item>
            
            <el-form-item>
              <el-button type="primary" @click="recordTemperature" :loading="recording">
                记录温度
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <el-card style="margin-top: 20px;" v-if="selectedProduce">
      <template #header>
        <span>温度历史 - {{ selectedProduce.name }}</span>
      </template>
      
      <el-table :data="temperatureHistory" style="width: 100%">
        <el-table-column prop="timestamp" label="时间" width="180">
          <template #default="{ row }">{{ formatDate(row.timestamp) }}</template>
        </el-table-column>
        <el-table-column prop="temperature" label="温度(°C)" width="120">
          <template #default="{ row }">
            <el-tag :type="row.temperature > 8 ? 'danger' : 'success'">
              {{ row.temperature }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="地点" />
        <el-table-column prop="reader" label="采集人" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.temperature > 8 ? 'danger' : 'success'">
              {{ row.temperature > 8 ? '超标' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const produces = ref([])
const alerts = ref([])
const temperatureHistory = ref([])
const selectedProduce = ref(null)
const recording = ref(false)

const tempForm = reactive({
  produceId: '',
  temperature: 4.0,
  location: '',
  reader: ''
})

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

async function loadProduces() {
  try {
    const response = await api.get('/produce')
    produces.value = response.data
  } catch (error) {
    console.error('加载产品列表失败:', error)
  }
}

async function loadAlerts() {
  try {
    const response = await api.get('/temperature/alerts/current')
    alerts.value = response.data
  } catch (error) {
    console.error('加载告警失败:', error)
  }
}

async function recordTemperature() {
  if (!tempForm.produceId) {
    ElMessage.warning('请选择产品')
    return
  }
  
  recording.value = true
  try {
    await api.post('/temperature/record', tempForm)
    ElMessage.success('温度记录成功')
    
    if (tempForm.temperature > 8) {
      ElMessage.warning('温度超标，已触发告警!')
    }
    
    loadAlerts()
    
    const produce = produces.value.find(p => p.id === tempForm.produceId)
    if (produce) {
      selectedProduce.value = produce
      loadTemperatureHistory(tempForm.produceId)
    }
  } catch (error) {
    ElMessage.error('记录温度失败')
  } finally {
    recording.value = false
  }
}

async function loadTemperatureHistory(produceId) {
  try {
    const response = await api.get(`/temperature/${produceId}`)
    temperatureHistory.value = response.data.reverse()
  } catch (error) {
    console.error('加载温度历史失败:', error)
  }
}

onMounted(() => {
  loadProduces()
  loadAlerts()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
