<template>
  <div class="dashboard">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #409EFF;">
              <el-icon :size="30"><Goods /></el-icon>
            </div>
            <div class="stat-info">
              <p class="stat-value">{{ stats.totalProduces }}</p>
              <p class="stat-label">农产品总数</p>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #67C23A;">
              <el-icon :size="30"><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <p class="stat-value">{{ stats.inTransit }}</p>
              <p class="stat-label">流转中</p>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #E6A23C;">
              <el-icon :size="30"><Document /></el-icon>
            </div>
            <div class="stat-info">
              <p class="stat-value">{{ stats.inspections }}</p>
              <p class="stat-label">质检报告</p>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #F56C6C;">
              <el-icon :size="30"><Transfer /></el-icon>
            </div>
            <div class="stat-info">
              <p class="stat-value">{{ stats.transfers }}</p>
              <p class="stat-label">流转记录</p>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>最近添加</span>
          </template>
          <el-table :data="recentProduces" style="width: 100%">
            <el-table-column prop="name" label="名称" />
            <el-table-column prop="batchNumber" label="批次" />
            <el-table-column prop="quantity" label="数量">
              <template #default="{ row }">
                {{ row.quantity }} {{ row.unit }}
              </template>
            </el-table-column>
            <el-table-column prop="currentOwner" label="当前持有方" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>快捷操作</span>
          </template>
          <div class="quick-actions">
            <el-button type="primary" size="large" @click="$router.push('/produce/create')" v-if="isFarmOrFactory">
              <el-icon><Plus /></el-icon>
              新增农产品
            </el-button>
            <el-button type="success" size="large" @click="$router.push('/transfer')" v-if="canTransfer">
              <el-icon><Transfer /></el-icon>
              产品流转
            </el-button>
            <el-button type="warning" size="large" @click="$router.push('/inspection')" v-if="isInspectorOrFactory">
              <el-icon><DocumentChecked /></el-icon>
              添加质检
            </el-button>
            <el-button type="info" size="large" @click="$router.push('/scan')">
              <el-icon><Camera /></el-icon>
              扫码溯源
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../api'

const authStore = useAuthStore()

const stats = ref({
  totalProduces: 0,
  inTransit: 0,
  inspections: 0,
  transfers: 0
})

const recentProduces = ref([])

const userRole = computed(() => authStore.userRole)
const isFarmOrFactory = computed(() => 
  userRole.value === 'farm' || userRole.value === 'factory'
)
const canTransfer = computed(() => 
  userRole.value === 'farm' || userRole.value === 'factory' || userRole.value === 'logistics'
)
const isInspectorOrFactory = computed(() => 
  userRole.value === 'inspector' || userRole.value === 'factory'
)

async function loadData() {
  try {
    const response = await api.get('/produce')
    const produces = response.data
    
    stats.value.totalProduces = produces.length
    stats.value.inTransit = produces.filter(p => p.status === 'TRANSFERRED').length
    recentProduces.value = produces.slice(0, 5)
    
    let totalTransfers = 0
    let totalReports = 0
    for (const produce of produces) {
      const historyRes = await api.get(`/produce/${produce.id}/history`)
      totalTransfers += historyRes.data.transfers.length
      totalReports += historyRes.data.reports.length
    }
    stats.value.transfers = totalTransfers
    stats.value.inspections = totalReports
  } catch (error) {
    console.error('加载数据失败:', error)
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.stat-card {
  border-radius: 8px;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
  margin: 0;
}

.stat-label {
  color: #909399;
  margin: 0;
  font-size: 14px;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-actions .el-button {
  justify-content: center;
  gap: 8px;
}
</style>
