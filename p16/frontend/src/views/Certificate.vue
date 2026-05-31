<template>
  <div class="certificate">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>溯源证书管理</span>
        </div>
      </template>
      
      <el-form :model="certForm" label-width="100px" style="max-width: 500px;">
        <el-form-item label="选择产品" prop="produceId">
          <el-select 
            v-model="certForm.produceId" 
            style="width: 100%" 
            filterable 
            placeholder="请选择产品"
            @change="onProduceChange"
          >
            <el-option 
              v-for="produce in produces" 
              :key="produce.id" 
              :label="`${produce.name} - ${produce.batchNumber}`"
              :value="produce.id"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item v-if="certForm.produceId">
          <el-button type="primary" @click="previewCertificate" :loading="loading">
            <el-icon><View /></el-icon>
            预览证书
          </el-button>
          <el-button type="success" @click="downloadCertificate" :loading="loading">
            <el-icon><Download /></el-icon>
            下载PDF证书
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 20px;" v-if="certForm.produceId">
      <template #header>
        <div class="card-header">
          <span>产品信息</span>
        </div>
      </template>
      
      <el-descriptions :column="2" border v-if="selectedProduce">
        <el-descriptions-item label="产品ID">{{ selectedProduce.id }}</el-descriptions-item>
        <el-descriptions-item label="产品名称">{{ selectedProduce.name }}</el-descriptions-item>
        <el-descriptions-item label="批次号">{{ selectedProduce.batchNumber }}</el-descriptions-item>
        <el-descriptions-item label="数量">{{ selectedProduce.quantity }} {{ selectedProduce.unit }}</el-descriptions-item>
        <el-descriptions-item label="当前持有方">{{ selectedProduce.currentOwner }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusTagType(selectedProduce.status)">
            {{ getStatusName(selectedProduce.status) }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
      
      <div v-if="priceData" style="margin-top: 20px;">
        <el-alert
          title="私有价格数据"
          type="info"
          :description="`价格: ${priceData.price} ${priceData.currency} (${priceData.ownerOrg}私有数据)`"
          show-icon
        />
      </div>
      
      <el-divider />
      
      <div v-if="showPriceForm" style="margin-top: 20px;">
        <h4>设置私有价格（仅授权组织可见）</h4>
        <el-form :model="priceForm" inline>
          <el-form-item label="价格">
            <el-input-number v-model="priceForm.price" :min="0" :step="0.01" />
          </el-form-item>
          <el-form-item label="货币">
            <el-select v-model="priceForm.currency">
              <el-option label="CNY" value="CNY" />
              <el-option label="USD" value="USD" />
              <el-option label="EUR" value="EUR" />
            </el-select>
          </el-form-item>
          <el-form-item label="所属组织">
            <el-select v-model="priceForm.ownerOrg">
              <el-option label="Org1" value="Org1MSP" />
              <el-option label="Org2" value="Org2MSP" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="setPrivatePrice" :loading="settingPrice">
              设置价格
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-card>

    <el-card style="margin-top: 20px;">
      <template #header>
        <span>证书生成历史</span>
      </template>
      
      <el-table :data="certHistory" style="width: 100%">
        <el-table-column prop="certificate_id" label="证书编号" />
        <el-table-column prop="produce_id" label="产品ID" />
        <el-table-column prop="generated_by" label="生成人" />
        <el-table-column prop="created_at" label="生成时间">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="previewVisible" title="证书预览" width="900px">
      <iframe 
        :src="previewUrl" 
        style="width: 100%; height: 600px; border: none;"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const authStore = useAuthStore()

const produces = ref([])
const selectedProduce = ref(null)
const priceData = ref(null)
const certHistory = ref([])
const loading = ref(false)
const settingPrice = ref(false)
const previewVisible = ref(false)
const previewUrl = ref('')

const certForm = reactive({
  produceId: ''
})

const priceForm = reactive({
  price: 0,
  currency: 'CNY',
  ownerOrg: 'Org1MSP'
})

const showPriceForm = computed(() => {
  return ['farm', 'factory'].includes(authStore.userRole)
})

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

function getStatusName(status) {
  const names = {
    'CREATED': '已创建',
    'TRANSFERRED': '流转中',
    'TEMP_ALERT': '温度异常',
    'DELIVERED': '已送达'
  }
  return names[status] || status
}

function getStatusTagType(status) {
  const types = {
    'CREATED': 'primary',
    'TRANSFERRED': 'warning',
    'TEMP_ALERT': 'danger',
    'DELIVERED': 'success'
  }
  return types[status] || ''
}

async function loadProduces() {
  try {
    const response = await api.get('/produce')
    produces.value = response.data
  } catch (error) {
    console.error('加载产品列表失败:', error)
  }
}

async function onProduceChange(produceId) {
  selectedProduce.value = produces.value.find(p => p.id === produceId)
  priceData.value = null
  
  try {
    const priceRes = await api.get(`/price/${produceId}`)
    priceData.value = priceRes.data
  } catch (error) {
    console.log('无价格数据或无权限')
  }
  
  loadCertHistory(produceId)
}

async function setPrivatePrice() {
  if (!certForm.produceId) {
    ElMessage.warning('请先选择产品')
    return
  }
  
  settingPrice.value = true
  try {
    await api.post('/price/set', {
      produceId: certForm.produceId,
      price: priceForm.price,
      currency: priceForm.currency,
      ownerOrg: priceForm.ownerOrg
    })
    ElMessage.success('价格设置成功（私有数据集合）')
    
    const priceRes = await api.get(`/price/${certForm.produceId}`)
    priceData.value = priceRes.data
  } catch (error) {
    ElMessage.error('设置价格失败')
  } finally {
    settingPrice.value = false
  }
}

async function previewCertificate() {
  if (!certForm.produceId) {
    ElMessage.warning('请先选择产品')
    return
  }
  
  previewUrl.value = `/api/certificate/preview/${certForm.produceId}?t=${Date.now()}`
  previewVisible.value = true
}

async function downloadCertificate() {
  if (!certForm.produceId) {
    ElMessage.warning('请先选择产品')
    return
  }
  
  loading.value = true
  try {
    window.open(`/api/certificate/${certForm.produceId}`, '_blank')
    ElMessage.success('证书下载已开始')
    setTimeout(() => loadCertHistory(certForm.produceId), 1000)
  } catch (error) {
    ElMessage.error('下载证书失败')
  } finally {
    loading.value = false
  }
}

async function loadCertHistory(produceId) {
  try {
    const response = await api.get(`/certificate/list/${produceId}`)
    certHistory.value = response.data
  } catch (error) {
    console.error('加载证书历史失败:', error)
  }
}

onMounted(() => {
  loadProduces()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
