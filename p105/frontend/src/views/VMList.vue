<template>
  <div class="vm-list">
    <div class="page-header">
      <h1 class="page-title">虚拟机列表</h1>
      <el-button type="primary" @click="syncVMs" :loading="syncing">
        <el-icon><Refresh /></el-icon>
        同步虚拟机
      </el-button>
    </div>

    <el-row :gutter="20">
      <el-col :xs="24" :sm="12" :md="8" :lg="6" v-for="vm in vms" :key="vm.id">
        <el-card class="vm-card" @click="goToDetail(vm)">
          <template #header>
            <div class="card-header">
              <span class="vm-name">{{ vm.name }}</span>
              <el-tag :type="getStatusType(vm.status)" size="small">
                {{ vm.status }}
              </el-tag>
            </div>
          </template>
          <div class="vm-info">
            <div class="info-item">
              <el-icon><Files /></el-icon>
              <span>UUID: {{ vm.uuid || '-' }}</span>
            </div>
            <div class="info-item">
              <el-icon><Operation /></el-icon>
              <span>系统: {{ vm.os_type || '-' }}</span>
            </div>
            <div class="info-item">
              <el-icon><Disc /></el-icon>
              <span class="disk-path">磁盘: {{ vm.disk_path || '-' }}</span>
            </div>
          </div>
          <div class="card-footer">
            <span class="create-time">创建时间: {{ formatDate(vm.created_at) }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-empty v-if="vms.length === 0 && !loading" description="暂无虚拟机，请点击同步按钮" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Files, Operation, Disc } from '@element-plus/icons-vue'
import api from '../api'

const router = useRouter()
const vms = ref([])
const loading = ref(false)
const syncing = ref(false)

const loadVMs = async () => {
  loading.value = true
  try {
    const res = await api.getVMs()
    if (res.data.success) {
      vms.value = res.data.data
    }
  } catch (error) {
    ElMessage.error('加载虚拟机列表失败')
  } finally {
    loading.value = false
  }
}

const syncVMs = async () => {
  syncing.value = true
  try {
    const res = await api.syncVMs()
    if (res.data.success) {
      ElMessage.success('同步成功')
      await loadVMs()
    }
  } catch (error) {
    ElMessage.error('同步失败: ' + (error.response?.data?.error || error.message))
  } finally {
    syncing.value = false
  }
}

const goToDetail = (vm) => {
  router.push(`/vm/${vm.id}`)
}

const getStatusType = (status) => {
  if (status.includes('running')) return 'success'
  if (status.includes('stopped') || status.includes('shut')) return 'info'
  return 'warning'
}

const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString()
}

onMounted(() => {
  loadVMs()
})
</script>

<style scoped>
.vm-list {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.vm-name {
  font-weight: 600;
  font-size: 16px;
}

.vm-info {
  min-height: 120px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #606266;
}

.disk-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.card-footer {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
  font-size: 12px;
  color: #909399;
}
</style>
