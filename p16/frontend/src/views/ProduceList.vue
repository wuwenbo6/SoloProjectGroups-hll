<template>
  <div class="produce-list">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>农产品列表</span>
          <el-button type="primary" @click="$router.push('/produce/create')" v-if="isFarmOrFactory">
            <el-icon><Plus /></el-icon>
            新增农产品
          </el-button>
        </div>
      </template>
      
      <el-table :data="produces" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="120" />
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="batchNumber" label="批次号" />
        <el-table-column prop="quantity" label="数量">
          <template #default="{ row }">
            {{ row.quantity }} {{ row.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="currentOwner" label="当前持有方" />
        <el-table-column prop="ownerRole" label="角色">
          <template #default="{ row }">
            <el-tag :type="getRoleTagType(row.ownerRole)">
              {{ getRoleName(row.ownerRole) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">
              {{ getStatusName(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewDetail(row.id)">详情</el-button>
            <el-button type="success" link @click="generateQR(row.id)">二维码</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="qrDialogVisible" title="溯源二维码" width="400">
      <div class="qr-content">
        <img :src="qrCode" alt="二维码" class="qr-image" />
        <p class="qr-text">扫描二维码查看溯源信息</p>
        <el-button type="primary" @click="downloadQR">下载二维码</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'
import api from '../api'

const router = useRouter()
const authStore = useAuthStore()

const produces = ref([])
const loading = ref(false)
const qrDialogVisible = ref(false)
const qrCode = ref('')
const currentProduceId = ref('')

const userRole = computed(() => authStore.userRole)
const isFarmOrFactory = computed(() => 
  userRole.value === 'farm' || userRole.value === 'factory'
)

function getRoleName(role) {
  const names = {
    farm: '农场',
    factory: '加工厂',
    logistics: '物流'
  }
  return names[role] || role
}

function getRoleTagType(role) {
  const types = {
    farm: 'success',
    factory: 'warning',
    logistics: 'info'
  }
  return types[role] || ''
}

function getStatusName(status) {
  const names = {
    CREATED: '已创建',
    TRANSFERRED: '流转中',
    DELIVERED: '已送达'
  }
  return names[status] || status
}

function getStatusTagType(status) {
  const types = {
    CREATED: 'primary',
    TRANSFERRED: 'warning',
    DELIVERED: 'success'
  }
  return types[status] || ''
}

async function loadProduces() {
  loading.value = true
  try {
    const response = await api.get('/produce')
    produces.value = response.data
  } catch (error) {
    ElMessage.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

function viewDetail(id) {
  router.push(`/produce/${id}`)
}

async function generateQR(id) {
  try {
    const response = await api.get(`/qr/generate/${id}`)
    qrCode.value = response.data.qrCode
    currentProduceId.value = id
    qrDialogVisible.value = true
  } catch (error) {
    ElMessage.error('生成二维码失败')
  }
}

function downloadQR() {
  const link = document.createElement('a')
  link.href = qrCode.value
  link.download = `qrcode-${currentProduceId.value}.png`
  link.click()
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

.qr-content {
  text-align: center;
}

.qr-image {
  width: 200px;
  height: 200px;
  margin: 20px 0;
}

.qr-text {
  color: #606266;
  margin-bottom: 20px;
}
</style>
