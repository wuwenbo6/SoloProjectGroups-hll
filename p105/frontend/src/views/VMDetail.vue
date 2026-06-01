<template>
  <div class="vm-detail">
    <div class="page-header">
      <div>
        <el-button @click="goBack" :icon="ArrowLeft">返回</el-button>
        <h1 class="page-title" style="margin-top: 10px;">{{ vm?.name }} - 备份管理</h1>
      </div>
      <div class="header-actions">
        <el-button type="success" @click="createFullBackup" :loading="creatingBackup">
          <el-icon><Download /></el-icon>
          完整备份
        </el-button>
        <el-button type="primary" @click="createIncrementalBackup" :loading="creatingBackup" :disabled="!hasBackup">
          <el-icon><DocumentCopy /></el-icon>
          增量备份
        </el-button>
      </div>
    </div>

    <el-card class="card">
      <template #header>
        <span>虚拟机信息</span>
      </template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="名称">{{ vm?.name }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(vm?.status)">{{ vm?.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="UUID">{{ vm?.uuid || '-' }}</el-descriptions-item>
        <el-descriptions-item label="操作系统">{{ vm?.os_type || '-' }}</el-descriptions-item>
        <el-descriptions-item label="磁盘路径" :span="2">{{ vm?.disk_path || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card class="card">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <span>备份链</span>
            <el-tag v-if="backupStats.needsMerge" type="warning" size="small">
              <el-icon><Warning /></el-icon>
              快照链过长，建议合并
            </el-tag>
            <span style="font-size: 12px; color: #909399;">
              总计: {{ backupStats.totalCount }} 个 (完整: {{ backupStats.fullCount }}, 增量: {{ backupStats.incrementalCount }})
              总大小: {{ formatSize(backupStats.totalSize) }}
            </span>
          </div>
          <div style="display: flex; gap: 10px;">
            <el-button 
              size="small" 
              type="warning" 
              @click="mergeBackupChain" 
              :loading="merging"
              :disabled="backupStats.incrementalCount < 2"
              :icon="Rank"
            >
              合并快照链
            </el-button>
            <el-button size="small" @click="loadBackupChain" :icon="Refresh">刷新</el-button>
          </div>
        </div>
      </template>
      
      <div class="backup-chain" v-if="backupChain.length > 0">
        <template v-for="(node, index) in flatBackupChain" :key="node.id">
          <div class="backup-node">
            <div 
              class="backup-node-content"
              :class="[node.type, `status-${node.status}`, { selected: selectedBackup?.id === node.id }]"
              @click="selectBackup(node)"
            >
              <div class="backup-type">
                <el-icon v-if="node.type === 'full'" color="#67c23a"><CircleCheck /></el-icon>
                <el-icon v-else color="#409eff"><Connection /></el-icon>
                <span>{{ node.type === 'full' ? '完整备份' : '增量备份' }}</span>
              </div>
              <div class="backup-name" :title="node.name">{{ node.name }}</div>
              <div class="backup-status">
                <el-tag size="small" :type="getBackupStatusType(node.status)">
                  {{ getBackupStatusText(node.status) }}
                </el-tag>
              </div>
              <div class="backup-info">
                <span v-if="node.changed_blocks">变化块: {{ node.changed_blocks }}</span>
                <span v-if="node.size">大小: {{ formatSize(node.size) }}</span>
              </div>
              <div class="backup-time">{{ formatDate(node.created_at) }}</div>
            </div>
          </div>
          <div class="backup-arrow" v-if="index < flatBackupChain.length - 1">
            <el-icon><ArrowRight /></el-icon>
          </div>
        </template>
      </div>
      
      <el-empty v-else description="暂无备份记录" />
    </el-card>

    <el-card class="card" v-if="selectedBackup">
      <template #header>
        <span>备份详情 - {{ selectedBackup.name }}</span>
      </template>
      
      <el-descriptions :column="2" border style="margin-bottom: 20px;">
        <el-descriptions-item label="备份类型">{{ selectedBackup.type === 'full' ? '完整备份' : '增量备份' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getBackupStatusType(selectedBackup.status)">
            {{ getBackupStatusText(selectedBackup.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="备份大小">{{ formatSize(selectedBackup.size) }}</el-descriptions-item>
        <el-descriptions-item label="变化块数">{{ selectedBackup.changed_blocks || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(selectedBackup.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="备份路径">{{ selectedBackup.backup_path || '-' }}</el-descriptions-item>
        <el-descriptions-item label="校验和" :span="2" v-if="selectedBackup.checksum">
          <el-tooltip :content="selectedBackup.checksum">
            <code style="font-size: 12px;">{{ selectedBackup.checksum.substring(0, 32) }}...</code>
          </el-tooltip>
          <el-tag size="small" style="margin-left: 10px;">{{ selectedBackup.checksum_algorithm?.toUpperCase() || 'SHA256' }}</el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <div class="backup-actions">
        <el-button type="primary" @click="mountBackup" :loading="mounting" :disabled="selectedBackup.status !== 'completed'">
          <el-icon><FolderOpened /></el-icon>
          挂载并浏览文件
        </el-button>
        <el-button @click="unmountBackup" :loading="unmounting" v-if="isMounted">
          <el-icon><RemoveFolder /></el-icon>
          卸载
        </el-button>
        <el-button type="warning" @click="restoreBackup" :loading="restoring" :disabled="selectedBackup.status !== 'completed'">
          <el-icon><RefreshRight /></el-icon>
          恢复到此备份
        </el-button>
        <el-button @click="verifyChecksum" :disabled="!selectedBackup.checksum">
          <el-icon><CircleCheck /></el-icon>
          验证校验和
        </el-button>
        <el-button @click="exportChecksum" :disabled="!selectedBackup.checksum">
          <el-icon><Download /></el-icon>
          导出校验和
        </el-button>
        <el-button @click="openRemoteTransferDialog" :disabled="selectedBackup.status !== 'completed'">
          <el-icon><Upload /></el-icon>
          异地备份
        </el-button>
        <el-button type="danger" @click="deleteBackup" :disabled="selectedBackup.status !== 'completed'">
          <el-icon><Delete /></el-icon>
          删除备份
        </el-button>
      </div>
    </el-card>

    <el-card class="card" v-if="isMounted && selectedBackup">
      <template #header>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span>文件浏览器</span>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item 
              v-for="(item, index) in breadcrumbs" 
              :key="index"
              :to="index === breadcrumbs.length - 1 ? undefined : { path: item.path }"
              @click="navigateTo(item.path)"
            >
              {{ item.name }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
      </template>
      
      <div class="file-browser">
        <div 
          class="file-item" 
          v-for="file in files" 
          :key="file.name"
          @click="handleFileClick(file)"
        >
          <div class="file-icon">
            <el-icon v-if="file.type === 'directory'" color="#409eff"><Folder /></el-icon>
            <el-icon v-else color="#909399"><Document /></el-icon>
          </div>
          <div class="file-info">
            <div class="file-name">{{ file.name }}</div>
            <div class="file-meta">
              <span v-if="file.type === 'file'">大小: {{ formatSize(file.size) }}</span>
              <span>修改时间: {{ formatDate(file.mtime) }}</span>
            </div>
          </div>
        </div>
        <el-empty v-if="files.length === 0" description="目录为空" />
      </div>
    </el-card>

    <el-dialog 
      v-model="remoteTransferDialogVisible" 
      title="异地备份传输"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item label="备份名称">
          <el-input :value="selectedBackup?.name" disabled />
        </el-form-item>
        <el-form-item label="备份大小">
          <el-input :value="formatSize(selectedBackup?.size)" disabled />
        </el-form-item>
        <el-form-item label="远程存储" required>
          <el-select 
            v-model="selectedRemoteConfig" 
            placeholder="请选择远程存储配置"
            style="width: 100%;"
          >
            <el-option 
              v-for="config in remoteConfigs" 
              :key="config.id" 
              :label="`${config.name} (${config.host})`" 
              :value="config.id" 
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="remoteTransferDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="transferToRemote" :loading="transferring">
          开始传输
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  ArrowLeft, Download, DocumentCopy, Refresh, CircleCheck, 
  Connection, ArrowRight, FolderOpened, RemoveFolder, 
  RefreshRight, Delete, Folder, Document, Warning, Rank, Upload
} from '@element-plus/icons-vue'
import api from '../api'

const router = useRouter()
const route = useRoute()

const vm = ref(null)
const backupChain = ref([])
const selectedBackup = ref(null)
const creatingBackup = ref(false)
const mounting = ref(false)
const unmounting = ref(false)
const restoring = ref(false)
const merging = ref(false)
const isMounted = ref(false)
const files = ref([])
const currentPath = ref('/')
const backupStats = ref({
  totalCount: 0,
  fullCount: 0,
  incrementalCount: 0,
  totalSize: 0,
  needsMerge: false
})

const remoteConfigs = ref([])
const remoteTransferDialogVisible = ref(false)
const selectedRemoteConfig = ref(null)
const transferring = ref(false)
const checksumVerifying = ref(false)

const hasBackup = computed(() => backupChain.value.length > 0)

const flatBackupChain = computed(() => {
  const result = []
  const flatten = (nodes) => {
    nodes.forEach(node => {
      result.push(node)
      if (node.children) {
        flatten(node.children)
      }
    })
  }
  flatten(backupChain.value)
  return result
})

const breadcrumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(p => p)
  const crumbs = [{ name: '根目录', path: '/' }]
  let path = ''
  parts.forEach(part => {
    path += '/' + part
    crumbs.push({ name: part, path })
  })
  return crumbs
})

const loadVM = async () => {
  try {
    const res = await api.getVMs()
    if (res.data.success) {
      vm.value = res.data.data.find(v => v.id === parseInt(route.params.id))
    }
  } catch (error) {
    ElMessage.error('加载虚拟机信息失败')
  }
}

const loadBackupChain = async () => {
  try {
    const res = await api.getBackupChain(route.params.id)
    if (res.data.success) {
      backupChain.value = res.data.data
      await loadBackupStats()
    }
  } catch (error) {
    ElMessage.error('加载备份链失败')
  }
}

const loadBackupStats = async () => {
  try {
    const res = await api.getBackupChainStats(route.params.id)
    if (res.data.success) {
      backupStats.value = res.data.data
    }
  } catch (error) {
    console.warn('加载备份统计失败:', error)
  }
}

const loadRemoteConfigs = async () => {
  try {
    const res = await api.getRemoteConfigs()
    if (res.data.success) {
      remoteConfigs.value = res.data.data.filter(c => c.enabled)
    }
  } catch (error) {
    console.warn('加载远程配置失败:', error)
  }
}

const verifyChecksum = async () => {
  if (!selectedBackup.value || !selectedBackup.value.checksum) return
  
  checksumVerifying.value = true
  try {
    const res = await api.verifyBackupChecksum(selectedBackup.value.id)
    if (res.data.success) {
      const result = res.data.data
      if (result.valid) {
        ElMessage.success('校验和验证通过！文件完整。')
      } else {
        ElMessage.error(`校验和验证失败！\n预期: ${result.expected}\n实际: ${result.actual}`)
      }
    }
  } catch (error) {
    ElMessage.error('验证失败: ' + (error.response?.data?.error || error.message))
  } finally {
    checksumVerifying.value = false
  }
}

const exportChecksum = async () => {
  if (!selectedBackup.value || !selectedBackup.value.checksum) return
  
  try {
    const res = await api.exportChecksumFile(selectedBackup.value.id)
    if (res.data.success) {
      const link = document.createElement('a')
      link.href = `/backups/${res.data.data.filename}`
      link.download = res.data.data.filename
      link.click()
      ElMessage.success('校验和文件已导出！')
    }
  } catch (error) {
    ElMessage.error('导出失败: ' + (error.response?.data?.error || error.message))
  }
}

const openRemoteTransferDialog = () => {
  if (remoteConfigs.value.length === 0) {
    ElMessage.warning('暂无可用的远程存储配置，请先在系统设置中配置')
    return
  }
  selectedRemoteConfig.value = null
  remoteTransferDialogVisible.value = true
}

const transferToRemote = async () => {
  if (!selectedRemoteConfig.value) {
    ElMessage.warning('请选择远程存储配置')
    return
  }
  
  transferring.value = true
  try {
    const res = await api.transferToRemote(selectedBackup.value.id, selectedRemoteConfig.value)
    if (res.data.success) {
      ElMessage.success('异地备份传输成功！')
      remoteTransferDialogVisible.value = false
    }
  } catch (error) {
    ElMessage.error('传输失败: ' + (error.response?.data?.error || error.message))
  } finally {
    transferring.value = false
  }
}

const selectBackup = (backup) => {
  selectedBackup.value = backup
  isMounted.value = false
  files.value = []
  currentPath.value = '/'
}

const createFullBackup = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要创建完整备份吗？这可能需要较长时间。',
      '确认',
      { type: 'warning' }
    )
    
    creatingBackup.value = true
    const res = await api.createFullBackup(route.params.id, vm.value.name)
    
    if (res.data.success) {
      ElMessage.success('完整备份创建成功')
      await loadBackupChain()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('创建备份失败: ' + (error.response?.data?.error || error.message))
    }
  } finally {
    creatingBackup.value = false
  }
}

const createIncrementalBackup = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要创建增量备份吗？',
      '确认',
      { type: 'warning' }
    )
    
    creatingBackup.value = true
    const res = await api.createIncrementalBackup(route.params.id, vm.value.name)
    
    if (res.data.success) {
      ElMessage.success(`增量备份创建成功，变化块: ${res.data.data.changedBlocks}`)
      await loadBackupChain()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('创建备份失败: ' + (error.response?.data?.error || error.message))
    }
  } finally {
    creatingBackup.value = false
  }
}

const mountBackup = async () => {
  try {
    mounting.value = true
    const res = await api.mountBackup(selectedBackup.value.id)
    
    if (res.data.success) {
      ElMessage.success('挂载成功')
      isMounted.value = true
      await loadFiles('/')
    }
  } catch (error) {
    ElMessage.error('挂载失败: ' + (error.response?.data?.error || error.message))
  } finally {
    mounting.value = false
  }
}

const unmountBackup = async () => {
  try {
    unmounting.value = true
    const res = await api.unmountBackup(selectedBackup.value.id)
    
    if (res.data.success) {
      ElMessage.success('卸载成功')
      isMounted.value = false
      files.value = []
      currentPath.value = '/'
    }
  } catch (error) {
    ElMessage.error('卸载失败: ' + (error.response?.data?.error || error.message))
  } finally {
    unmounting.value = false
  }
}

const loadFiles = async (path) => {
  try {
    const res = await api.browseFiles(selectedBackup.value.id, path)
    if (res.data.success) {
      files.value = res.data.data
      currentPath.value = path
    }
  } catch (error) {
    ElMessage.error('加载文件失败: ' + (error.response?.data?.error || error.message))
  }
}

const handleFileClick = (file) => {
  if (file.type === 'directory') {
    loadFiles(file.path)
  }
}

const navigateTo = (path) => {
  loadFiles(path)
}

const mergeBackupChain = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要合并快照链吗？这会将所有增量备份合并到基础备份，' +
      '合并后增量备份将被删除，性能会得到提升。',
      '确认合并',
      { type: 'warning', confirmButtonText: '确认合并', cancelButtonText: '取消' }
    )
    
    merging.value = true
    const res = await api.mergeBackupChain(route.params.id)
    
    if (res.data.success) {
      ElMessage.success(res.data.data.message || '合并成功')
      await loadBackupChain()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('合并失败: ' + (error.response?.data?.error || error.message))
    }
  } finally {
    merging.value = false
  }
}

const restoreBackup = async () => {
  try {
    const checkRes = await api.restoreBackup(selectedBackup.value.id, false)
    
    if (!checkRes.data.success) {
      const errorMsg = checkRes.data.error
      const { value } = await ElMessageBox.confirm(
        errorMsg + '\n\n是否要同时删除这些后续备份？此操作不可恢复！',
        '警告：存在后续备份',
        {
          type: 'warning',
          confirmButtonText: '恢复并删除后续备份',
          cancelButtonText: '取消',
          distinguishCancelAndClose: true
        }
      )
      
      if (value) {
        restoring.value = true
        const res = await api.restoreBackup(selectedBackup.value.id, true)
        if (res.data.success) {
          ElMessage.success(res.data.data.message || '恢复成功')
          selectedBackup.value = null
          await loadVM()
          await loadBackupChain()
        }
      }
    } else {
      await ElMessageBox.confirm(
        '确定要恢复到此备份吗？这将覆盖当前虚拟机状态。',
        '确认恢复',
        { type: 'warning', confirmButtonText: '确认恢复', cancelButtonText: '取消' }
      )
      
      restoring.value = true
      const res = await api.restoreBackup(selectedBackup.value.id, false)
      
      if (res.data.success) {
        ElMessage.success('恢复成功')
        await loadVM()
      }
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('恢复失败: ' + (error.response?.data?.error || error.message))
    }
  } finally {
    restoring.value = false
  }
}

const deleteBackup = async () => {
  try {
    const checkRes = await api.canDeleteBackup(selectedBackup.value.id)
    
    if (!checkRes.data.data.canDelete) {
      const { value } = await ElMessageBox.confirm(
        checkRes.data.data.message + '\n\n是否强制删除？子备份将重新连接到父备份。',
        '警告：存在子备份依赖',
        {
          type: 'warning',
          confirmButtonText: '强制删除',
          cancelButtonText: '取消',
          distinguishCancelAndClose: true
        }
      )
      
      if (value) {
        const res = await api.deleteBackup(selectedBackup.value.id, true)
        if (res.data.success) {
          ElMessage.success('删除成功，子备份已重新连接')
          selectedBackup.value = null
          isMounted.value = false
          await loadBackupChain()
        }
      }
    } else {
      await ElMessageBox.confirm(
        '确定要删除此备份吗？此操作不可恢复。',
        '确认删除',
        { type: 'warning' }
      )
      
      const res = await api.deleteBackup(selectedBackup.value.id, false)
      
      if (res.data.success) {
        ElMessage.success('删除成功')
        selectedBackup.value = null
        isMounted.value = false
        await loadBackupChain()
      }
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败: ' + (error.response?.data?.error || error.message))
    }
  }
}

const goBack = () => {
  router.push('/')
}

const getStatusType = (status) => {
  if (!status) return 'info'
  if (status.includes('running')) return 'success'
  if (status.includes('stopped') || status.includes('shut')) return 'info'
  return 'warning'
}

const getBackupStatusType = (status) => {
  const map = {
    'completed': 'success',
    'failed': 'danger',
    'pending': 'info',
    'creating_snapshot': 'warning',
    'comparing_blocks': 'warning',
    'copying': 'warning',
    'copying_changed': 'warning'
  }
  return map[status] || 'info'
}

const getBackupStatusText = (status) => {
  const map = {
    'completed': '已完成',
    'failed': '失败',
    'pending': '等待中',
    'creating_snapshot': '创建快照中',
    'comparing_blocks': '比较块中',
    'copying': '复制中',
    'copying_changed': '复制变化块中'
  }
  return map[status] || status
}

const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString()
}

const formatSize = (bytes) => {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

onMounted(() => {
  loadVM()
  loadBackupChain()
  loadRemoteConfigs()
})
</script>

<style scoped>
.vm-detail {
  padding: 0;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.backup-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.backup-type {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
}

.backup-name {
  font-size: 12px;
  color: #606266;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.backup-status {
  margin-bottom: 8px;
}

.backup-info {
  font-size: 11px;
  color: #909399;
  margin-bottom: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.backup-time {
  font-size: 11px;
  color: #909399;
}
</style>
