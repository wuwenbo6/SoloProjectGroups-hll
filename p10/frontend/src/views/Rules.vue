<template>
  <div class="rules">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>规则列表</span>
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
            添加规则
          </el-button>
        </div>
      </template>
      
      <el-table :data="rules" v-loading="loading" stripe>
        <el-table-column prop="name" label="规则名称" width="200" />
        <el-table-column prop="description" label="描述" />
        <el-table-column label="触发条件" min-width="250">
          <template #default="{ row }">
            <span class="condition-text">{{ formatCondition(row.condition) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="执行动作" min-width="200">
          <template #default="{ row }">
            <span class="action-text">{{ formatAction(row.action) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" @change="toggleRule(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="deleteRule(row.id)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="添加规则" width="600">
      <el-form :model="form" label-width="120px">
        <el-form-item label="规则名称">
          <el-input v-model="form.name" placeholder="例如：高温自动开风扇" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-divider content-position="left">触发条件</el-divider>
        <el-form-item label="设备">
          <el-select v-model="condition.device_id" placeholder="选择传感器" style="width: 100%">
            <el-option
              v-for="device in sensorDevices"
              :key="device.device_id"
              :label="device.name"
              :value="device.device_id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="数据类型">
          <el-select v-model="condition.data_type" style="width: 100%">
            <el-option label="温度" value="temperature" />
            <el-option label="湿度" value="humidity" />
            <el-option label="电源" value="power" />
          </el-select>
        </el-form-item>
        <el-form-item label="比较方式">
          <el-select v-model="condition.operator" style="width: 100%">
            <el-option label="大于" value=">" />
            <el-option label="大于等于" value=">=" />
            <el-option label="小于" value="<" />
            <el-option label="小于等于" value="<=" />
            <el-option label="等于" value="==" />
          </el-select>
        </el-form-item>
        <el-form-item label="阈值">
          <el-input-number v-model="condition.threshold" :min="-100" :max="1000" style="width: 100%" />
        </el-form-item>
        <el-divider content-position="left">执行动作</el-divider>
        <el-form-item label="目标设备">
          <el-select v-model="action.device_id" placeholder="选择控制设备" style="width: 100%">
            <el-option
              v-for="device in controlDevices"
              :key="device.device_id"
              :label="device.name"
              :value="device.device_id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="操作指令">
          <el-select v-model="actionCommand" style="width: 100%">
            <el-option label="打开设备" value="on" />
            <el-option label="关闭设备" value="off" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getRules, createRule, updateRule, deleteRule, getDevices } from '@/api'

const rules = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const devices = ref([])
const actionCommand = ref('on')

const form = reactive({
  name: '',
  description: '',
  enabled: true
})

const condition = reactive({
  device_id: '',
  data_type: 'temperature',
  operator: '>',
  threshold: 30
})

const action = reactive({
  device_id: '',
  command: { power: true }
})

const sensorDevices = computed(() => {
  return devices.value.filter(d => ['temperature', 'humidity', 'sensor'].includes(d.type))
})

const controlDevices = computed(() => {
  return devices.value.filter(d => ['fan', 'light', 'switch', 'thermostat'].includes(d.type))
})

const formatCondition = (condStr) => {
  try {
    const cond = JSON.parse(condStr)
    return `${cond.device_id}.${cond.data_type} ${cond.operator} ${cond.threshold}`
  } catch {
    return condStr
  }
}

const formatAction = (actionStr) => {
  try {
    const act = JSON.parse(actionStr)
    const status = act.command?.power ? '打开' : '关闭'
    return `${status} ${act.device_id}`
  } catch {
    return actionStr
  }
}

const loadRules = async () => {
  loading.value = true
  try {
    const res = await getRules()
    rules.value = res.data
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const loadDevices = async () => {
  try {
    const res = await getDevices()
    devices.value = res.data
  } catch (e) {
    console.error(e)
  }
}

const showAddDialog = () => {
  form.name = ''
  form.description = ''
  condition.device_id = ''
  condition.data_type = 'temperature'
  condition.operator = '>'
  condition.threshold = 30
  action.device_id = ''
  actionCommand.value = 'on'
  dialogVisible.value = true
}

const saveRule = async () => {
  if (!form.name || !condition.device_id || !action.device_id) {
    ElMessage.warning('请填写完整信息')
    return
  }

  action.command = { power: actionCommand.value === 'on' }

  const data = {
    ...form,
    condition: JSON.stringify(condition),
    action: JSON.stringify(action)
  }

  try {
    await createRule(data)
    ElMessage.success('规则创建成功')
    dialogVisible.value = false
    loadRules()
  } catch (e) {
    ElMessage.error('创建失败')
  }
}

const toggleRule = async (rule) => {
  try {
    await updateRule(rule.id, rule)
    ElMessage.success('状态已更新')
  } catch (e) {
    ElMessage.error('更新失败')
    rule.enabled = !rule.enabled
  }
}

const deleteRule = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除此规则吗？', '提示', {
      type: 'warning'
    })
    await deleteRule(id)
    ElMessage.success('删除成功')
    loadRules()
  } catch {
    // 用户取消
  }
}

onMounted(() => {
  loadRules()
  loadDevices()
})
</script>

<style scoped>
.card-header {
  font-weight: bold;
  font-size: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.condition-text, .action-text {
  font-family: monospace;
  background: #f5f7fa;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}
</style>
