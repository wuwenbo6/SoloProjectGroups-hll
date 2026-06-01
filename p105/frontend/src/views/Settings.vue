<template>
  <div class="settings">
    <div class="page-header">
      <h1 class="page-title">系统设置</h1>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="备份策略" name="policies">
        <div class="tab-content">
          <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
            <h3>自动备份策略</h3>
            <el-button type="primary" @click="openPolicyDialog">
              <el-icon><Plus /></el-icon>
              新建策略
            </el-button>
          </div>

          <el-table :data="policies" v-loading="loadingPolicies" stripe>
            <el-table-column prop="name" label="策略名称" width="180" />
            <el-table-column label="虚拟机" width="150">
              <template #default="{ row }">
                {{ getVMName(row.vm_id) }}
              </template>
            </el-table-column>
            <el-table-column prop="type" label="备份类型" width="120">
              <template #default="{ row }">
                <el-tag size="small" :type="row.type === 'full' ? 'success' : 'primary'">
                  {{ row.type === 'full' ? '完整备份' : '增量备份' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="cron_expression" label="执行计划" width="180">
              <template #default="{ row }">
                <el-tooltip :content="getCronDescription(row.cron_expression)">
                  <code>{{ row.cron_expression }}</code>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column prop="retention_count" label="保留数量" width="100" />
            <el-table-column label="上次执行" width="180">
              <template #default="{ row }">
                {{ row.last_run ? formatDate(row.last_run) : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="下次执行" width="180">
              <template #default="{ row }">
                {{ row.next_run ? formatDate(row.next_run) : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.enabled ? 'success' : 'info'">
                  {{ row.enabled ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="viewLogs(row)">日志</el-button>
                <el-button size="small" @click="editPolicy(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="deletePolicy(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="异地备份" name="remote">
        <div class="tab-content">
          <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
            <h3>SCP远程存储配置</h3>
            <el-button type="primary" @click="openRemoteDialog">
              <el-icon><Plus /></el-icon>
              新建配置
            </el-button>
          </div>

          <el-table :data="remoteConfigs" v-loading="loadingRemote" stripe>
            <el-table-column prop="name" label="配置名称" width="150" />
            <el-table-column prop="host" label="主机" width="180">
              <template #default="{ row }">
                {{ row.host }}:{{ row.port }}
              </template>
            </el-table-column>
            <el-table-column prop="username" label="用户名" width="120" />
            <el-table-column prop="remote_path" label="远程路径" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.enabled ? 'success' : 'info'">
                  {{ row.enabled ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="250" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="testConnection(row)">测试</el-button>
                <el-button size="small" @click="editRemote(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="deleteRemote(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-divider />

          <h3>异地备份记录</h3>
          <el-table :data="remoteBackups" v-loading="loadingRemoteBackups" stripe style="margin-top: 15px;">
            <el-table-column prop="backup_name" label="备份名称" width="200" />
            <el-table-column prop="config_name" label="存储配置" width="150" />
            <el-table-column prop="host" label="远程主机" width="180" />
            <el-table-column prop="remote_path" label="远程路径" />
            <el-table-column label="大小" width="120">
              <template #default="{ row }">
                {{ formatSize(row.size) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === 'completed' ? 'success' : row.status === 'failed' ? 'danger' : 'warning'">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="transferred_at" label="传输时间" width="180">
              <template #default="{ row }">
                {{ formatDate(row.transferred_at) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="Cron表达式助手" name="cron">
        <div class="tab-content">
          <el-card>
            <template #header>Cron表达式验证</template>
            <el-form :model="cronForm" label-width="100px">
              <el-form-item label="表达式">
                <el-input v-model="cronForm.expression" placeholder="例如: 0 2 * * * (每天凌晨2点)" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="validateCron">验证</el-button>
              </el-form-item>
            </el-form>

            <div v-if="cronResult.valid !== undefined" style="margin-top: 20px;">
              <el-alert 
                :title="cronResult.valid ? '表达式有效' : '表达式无效'" 
                :type="cronResult.valid ? 'success' : 'error'"
                show-icon
              />
              
              <div v-if="cronResult.valid && cronResult.nextRuns.length > 0" style="margin-top: 15px;">
                <h4>接下来5次执行时间:</h4>
                <ul>
                  <li v-for="(time, index) in cronResult.nextRuns" :key="index">
                    {{ formatDate(time) }}
                  </li>
                </ul>
              </div>
            </div>
          </el-card>

          <el-card style="margin-top: 20px;">
            <template #header>常用表达式</template>
            <el-table :data="commonCronExpressions" stripe>
              <el-table-column prop="expression" label="表达式" width="150" />
              <el-table-column prop="description" label="说明" />
            </el-table>
          </el-card>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog 
      v-model="policyDialogVisible" 
      :title="editingPolicy ? '编辑策略' : '新建策略'"
      width="600px"
    >
      <el-form :model="policyForm" label-width="120px">
        <el-form-item label="策略名称" required>
          <el-input v-model="policyForm.name" placeholder="请输入策略名称" />
        </el-form-item>
        <el-form-item label="虚拟机" required>
          <el-select v-model="policyForm.vm_id" placeholder="请选择虚拟机" style="width: 100%;">
            <el-option 
              v-for="vm in vms" 
              :key="vm.id" 
              :label="vm.name" 
              :value="vm.id" 
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备份类型" required>
          <el-radio-group v-model="policyForm.type">
            <el-radio value="incremental">智能增量</el-radio>
            <el-radio value="full">仅完整备份</el-radio>
          </el-radio-group>
          <div style="font-size: 12px; color: #909399; margin-top: 5px;">
            智能增量: 定期自动创建完整备份，其他时间创建增量备份
          </div>
        </el-form-item>
        <el-form-item label="Cron表达式" required>
          <el-input v-model="policyForm.cron_expression" placeholder="例如: 0 2 * * *" />
          <div style="font-size: 12px; color: #909399; margin-top: 5px;">
            格式: 分 时 日 月 周
          </div>
        </el-form-item>
        <el-form-item label="保留备份数">
          <el-input-number v-model="policyForm.retention_count" :min="1" :max="100" />
        </el-form-item>
        <el-form-item label="完整备份间隔" v-if="policyForm.type === 'incremental'">
          <el-input-number v-model="policyForm.full_backup_interval" :min="1" :max="30" />
          <span style="margin-left: 10px; font-size: 12px; color: #909399;">天</span>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="policyForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="policyDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="savePolicy">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog 
      v-model="remoteDialogVisible" 
      :title="editingRemote ? '编辑配置' : '新建配置'"
      width="600px"
    >
      <el-form :model="remoteForm" label-width="120px">
        <el-form-item label="配置名称" required>
          <el-input v-model="remoteForm.name" placeholder="请输入配置名称" />
        </el-form-item>
        <el-form-item label="主机地址" required>
          <el-input v-model="remoteForm.host" placeholder="例如: 192.168.1.100" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="remoteForm.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="用户名" required>
          <el-input v-model="remoteForm.username" placeholder="SSH用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="remoteForm.password" type="password" placeholder="留空则使用密钥认证" />
        </el-form-item>
        <el-form-item label="密钥路径">
          <el-input v-model="remoteForm.private_key_path" placeholder="/root/.ssh/id_rsa" />
        </el-form-item>
        <el-form-item label="远程路径" required>
          <el-input v-model="remoteForm.remote_path" placeholder="/backup/kvm" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="remoteForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="remoteDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRemote">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="logsDialogVisible" title="执行日志" width="800px">
      <el-table :data="policyLogs" stripe>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'success' ? 'success' : 'danger'">
              {{ row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="backup_name" label="备份名称" width="200" />
        <el-table-column prop="message" label="消息" />
        <el-table-column prop="created_at" label="时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '../api'

const activeTab = ref('policies')
const loadingPolicies = ref(false)
const loadingRemote = ref(false)
const loadingRemoteBackups = ref(false)

const policies = ref([])
const vms = ref([])
const remoteConfigs = ref([])
const remoteBackups = ref([])

const policyDialogVisible = ref(false)
const editingPolicy = ref(null)
const policyForm = ref({
  name: '',
  vm_id: null,
  type: 'incremental',
  cron_expression: '0 2 * * *',
  retention_count: 7,
  full_backup_interval: 7,
  enabled: true
})

const remoteDialogVisible = ref(false)
const editingRemote = ref(null)
const remoteForm = ref({
  name: '',
  host: '',
  port: 22,
  username: '',
  password: '',
  private_key_path: '',
  remote_path: '',
  enabled: true
})

const logsDialogVisible = ref(false)
const policyLogs = ref([])

const cronForm = ref({ expression: '' })
const cronResult = ref({})

const commonCronExpressions = [
  { expression: '0 * * * *', description: '每小时执行一次' },
  { expression: '0 2 * * *', description: '每天凌晨2点执行' },
  { expression: '0 2 * * 0', description: '每周日凌晨2点执行' },
  { expression: '0 2 1 * *', description: '每月1号凌晨2点执行' },
  { expression: '0 */6 * * *', description: '每6小时执行一次' },
  { expression: '0 2,14 * * *', description: '每天凌晨2点和下午2点执行' },
  { expression: '0 0 * * 1-5', description: '工作日每天零点执行' }
]

const loadPolicies = async () => {
  loadingPolicies.value = true
  try {
    const res = await api.getPolicies()
    if (res.data.success) {
      policies.value = res.data.data
    }
  } catch (error) {
    ElMessage.error('加载策略失败')
  } finally {
    loadingPolicies.value = false
  }
}

const loadVMs = async () => {
  try {
    const res = await api.getVMs()
    if (res.data.success) {
      vms.value = res.data.data
    }
  } catch (error) {
    console.error('加载虚拟机失败')
  }
}

const getVMName = (vmId) => {
  const vm = vms.value.find(v => v.id === vmId)
  return vm ? vm.name : '-'
}

const loadRemoteConfigs = async () => {
  loadingRemote.value = true
  try {
    const res = await api.getRemoteConfigs()
    if (res.data.success) {
      remoteConfigs.value = res.data.data
    }
  } catch (error) {
    ElMessage.error('加载远程配置失败')
  } finally {
    loadingRemote.value = false
  }
}

const loadRemoteBackups = async () => {
  loadingRemoteBackups.value = true
  try {
    const res = await api.getRemoteBackups()
    if (res.data.success) {
      remoteBackups.value = res.data.data
    }
  } catch (error) {
    console.error('加载异地备份记录失败')
  } finally {
    loadingRemoteBackups.value = false
  }
}

const openPolicyDialog = () => {
  editingPolicy.value = null
  policyForm.value = {
    name: '',
    vm_id: null,
    type: 'incremental',
    cron_expression: '0 2 * * *',
    retention_count: 7,
    full_backup_interval: 7,
    enabled: true
  }
  policyDialogVisible.value = true
}

const editPolicy = (row) => {
  editingPolicy.value = row
  policyForm.value = { ...row }
  policyDialogVisible.value = true
}

const savePolicy = async () => {
  try {
    if (editingPolicy.value) {
      await api.updatePolicy(editingPolicy.value.id, policyForm.value)
      ElMessage.success('策略更新成功')
    } else {
      await api.createPolicy(policyForm.value)
      ElMessage.success('策略创建成功')
    }
    policyDialogVisible.value = false
    await loadPolicies()
  } catch (error) {
    ElMessage.error('保存失败: ' + (error.response?.data?.error || error.message))
  }
}

const deletePolicy = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除此策略吗？', '确认删除', { type: 'warning' })
    await api.deletePolicy(row.id)
    ElMessage.success('删除成功')
    await loadPolicies()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const viewLogs = async (row) => {
  try {
    const res = await api.getPolicyLogs(row.id)
    if (res.data.success) {
      policyLogs.value = res.data.data
      logsDialogVisible.value = true
    }
  } catch (error) {
    ElMessage.error('加载日志失败')
  }
}

const openRemoteDialog = () => {
  editingRemote.value = null
  remoteForm.value = {
    name: '',
    host: '',
    port: 22,
    username: '',
    password: '',
    private_key_path: '',
    remote_path: '',
    enabled: true
  }
  remoteDialogVisible.value = true
}

const editRemote = (row) => {
  editingRemote.value = row
  remoteForm.value = { ...row }
  remoteDialogVisible.value = true
}

const saveRemote = async () => {
  try {
    if (editingRemote.value) {
      await api.updateRemoteConfig(editingRemote.value.id, remoteForm.value)
      ElMessage.success('配置更新成功')
    } else {
      await api.createRemoteConfig(remoteForm.value)
      ElMessage.success('配置创建成功')
    }
    remoteDialogVisible.value = false
    await loadRemoteConfigs()
  } catch (error) {
    ElMessage.error('保存失败: ' + (error.response?.data?.error || error.message))
  }
}

const deleteRemote = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除此配置吗？', '确认删除', { type: 'warning' })
    await api.deleteRemoteConfig(row.id)
    ElMessage.success('删除成功')
    await loadRemoteConfigs()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const testConnection = async (row) => {
  try {
    const res = await api.testRemoteConfig(row.id)
    if (res.data.success) {
      ElMessage.success('连接成功！')
    }
  } catch (error) {
    ElMessage.error('连接失败: ' + (error.response?.data?.error || error.message))
  }
}

const validateCron = async () => {
  try {
    const res = await api.validateCron(cronForm.value.expression)
    if (res.data.success) {
      cronResult.value = res.data.data
    }
  } catch (error) {
    ElMessage.error('验证失败')
  }
}

const getCronDescription = (expr) => {
  const item = commonCronExpressions.find(c => c.expression === expr)
  return item ? item.description : expr
}

const getStatusText = (status) => {
  const map = {
    'completed': '已完成',
    'failed': '失败',
    'transferring': '传输中',
    'pending': '等待中'
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
  loadVMs()
  loadPolicies()
  loadRemoteConfigs()
  loadRemoteBackups()
})
</script>

<style scoped>
.settings {
  padding: 0;
}

.tab-content {
  min-height: 400px;
}

code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}

h3 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #303133;
}

h4 {
  margin: 15px 0 10px 0;
  font-size: 14px;
  color: #606266;
}

ul {
  margin: 10px 0;
  padding-left: 20px;
}

li {
  margin-bottom: 5px;
  font-size: 13px;
  color: #606266;
}
</style>
