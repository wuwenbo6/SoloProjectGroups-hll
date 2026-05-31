<template>
  <div class="scenes">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>场景列表</span>
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
            添加场景
          </el-button>
        </div>
      </template>
      
      <el-row :gutter="20">
        <el-col :span="8" v-for="scene in scenes" :key="scene.id">
          <el-card class="scene-card" :class="{ disabled: !scene.enabled }">
            <div class="scene-header">
              <div class="scene-title">
                <el-icon size="24" :color="scene.enabled ? '#409eff' : '#999'">
                  <component :is="getSceneIcon(scene.trigger_type)" />
                </el-icon>
                <span>{{ scene.name }}</span>
              </div>
              <el-switch v-model="scene.enabled" @change="toggleScene(scene)" size="small" />
            </div>
            <div class="scene-desc">{{ scene.description }}</div>
            <div class="scene-trigger">
              <el-tag size="small">
                {{ scene.trigger_type === 'scheduled' ? '定时触发' : '条件触发' }}
              </el-tag>
              <span class="trigger-info">
                {{ scene.trigger_type === 'scheduled' ? scene.cron_expr : formatTrigger(scene.trigger) }}
              </span>
            </div>
            <div class="scene-actions">
              <el-button size="small" @click="triggerScene(scene.id)">立即执行</el-button>
              <el-button size="small" type="primary" @click="editScene(scene)">编辑</el-button>
              <el-button size="small" type="danger" @click="deleteScene(scene.id)">删除</el-button>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-empty v-if="scenes.length === 0" description="暂无场景" style="margin-top: 40px" />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑场景' : '添加场景'" width="700px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="场景名称">
          <el-input v-model="form.name" placeholder="例如：回家模式" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="触发方式">
          <el-radio-group v-model="form.trigger_type">
            <el-radio value="condition">条件触发</el-radio>
            <el-radio value="scheduled">定时触发</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <template v-if="form.trigger_type === 'scheduled'">
          <el-form-item label="Cron表达式">
            <el-input v-model="form.cron_expr" placeholder="例如：0 0 18 * * *" />
            <div class="cron-help">秒 分 时 日 月 周</div>
          </el-form-item>
        </template>

        <template v-if="form.trigger_type === 'condition'">
          <el-form-item label="传感器">
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
            </el-select>
          </el-form-item>
          <el-form-item label="比较方式">
            <el-select v-model="condition.operator" style="width: 100%">
              <el-option label="大于" value=">" />
              <el-option label="小于" value="<" />
            </el-select>
          </el-form-item>
          <el-form-item label="阈值">
            <el-input-number v-model="condition.threshold" style="width: 100%" />
          </el-form-item>
        </template>

        <el-divider>执行动作</el-divider>
        <el-form-item label="动作列表">
          <div v-for="(act, index) in actions" :key="index" class="action-item">
            <el-select v-model="act.device_id" placeholder="选择设备" style="width: 180px; margin-right: 10px">
              <el-option
                v-for="device in controlDevices"
                :key="device.device_id"
                :label="device.name"
                :value="device.device_id"
              />
            </el-select>
            <el-select v-model="act.command" style="width: 120px; margin-right: 10px">
              <el-option label="打开" value="on" />
              <el-option label="关闭" value="off" />
            </el-select>
            <el-button type="danger" size="small" @click="actions.splice(index, 1)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-button size="small" @click="actions.push({ device_id: '', command: 'on' })">
            <el-icon><Plus /></el-icon>
            添加动作
          </el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveScene">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getScenes, createScene, updateScene, deleteScene, triggerScene as apiTriggerScene, getDevices } from '@/api'

const scenes = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const devices = ref([])

const form = reactive({
  id: null,
  name: '',
  description: '',
  trigger_type: 'condition',
  cron_expr: '0 0 18 * * *',
  enabled: true
})

const condition = reactive({
  device_id: '',
  data_type: 'temperature',
  operator: '>',
  threshold: 30
})

const actions = ref([])

const sensorDevices = computed(() => {
  return devices.value.filter(d => ['temperature', 'humidity', 'sensor'].includes(d.type))
})

const controlDevices = computed(() => {
  return devices.value.filter(d => ['fan', 'light', 'switch', 'thermostat'].includes(d.type))
})

const getSceneIcon = (type) => {
  return type === 'scheduled' ? 'Clock' : 'TrendCharts'
}

const formatTrigger = (trigger) => {
  try {
    const t = JSON.parse(trigger)
    return `${t.device_id}.${t.data_type} ${t.operator} ${t.threshold}`
  } catch {
    return trigger
  }
}

const loadScenes = async () => {
  try {
    const res = await getScenes()
    scenes.value = res.data
  } catch (e) {
    console.error(e)
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
  isEdit.value = false
  form.id = null
  form.name = ''
  form.description = ''
  form.trigger_type = 'condition'
  form.cron_expr = '0 0 18 * * *'
  condition.device_id = ''
  condition.data_type = 'temperature'
  condition.operator = '>'
  condition.threshold = 30
  actions.value = []
  dialogVisible.value = true
}

const editScene = (scene) => {
  isEdit.value = true
  form.id = scene.id
  form.name = scene.name
  form.description = scene.description
  form.trigger_type = scene.trigger_type
  form.cron_expr = scene.cron_expr || '0 0 18 * * *'
  
  if (scene.trigger) {
    try {
      const t = JSON.parse(scene.trigger)
      condition.device_id = t.device_id
      condition.data_type = t.data_type
      condition.operator = t.operator
      condition.threshold = t.threshold
    } catch (e) {
      console.error(e)
    }
  }

  try {
    const acts = JSON.parse(scene.actions || '[]')
    actions.value = acts.map(a => ({
      device_id: a.device_id,
      command: a.command?.power ? 'on' : 'off'
    }))
  } catch {
    actions.value = []
  }
  
  dialogVisible.value = true
}

const saveScene = async () => {
  if (!form.name) {
    ElMessage.warning('请填写场景名称')
    return
  }

  const data = {
    ...form,
    trigger: form.trigger_type === 'condition' ? JSON.stringify(condition) : '',
    actions: JSON.stringify(actions.value.map(a => ({
      device_id: a.device_id,
      command: JSON.stringify({ power: a.command === 'on' })
    })))
  }

  try {
    if (isEdit.value) {
      await updateScene(form.id, data)
    } else {
      await createScene(data)
    }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    loadScenes()
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

const toggleScene = async (scene) => {
  try {
    await updateScene(scene.id, scene)
    ElMessage.success('状态已更新')
  } catch (e) {
    ElMessage.error('更新失败')
    scene.enabled = !scene.enabled
  }
}

const triggerScene = async (id) => {
  try {
    await apiTriggerScene(id)
    ElMessage.success('场景已触发')
  } catch (e) {
    ElMessage.error('触发失败')
  }
}

const deleteScene = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除此场景吗？', '提示', {
      type: 'warning'
    })
    await deleteScene(id)
    ElMessage.success('删除成功')
    loadScenes()
  } catch {
    // 用户取消
  }
}

onMounted(() => {
  loadScenes()
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
.scene-card {
  margin-bottom: 20px;
  transition: all 0.3s;
}
.scene-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.scene-card.disabled {
  opacity: 0.6;
}
.scene-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.scene-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}
.scene-desc {
  color: #666;
  font-size: 13px;
  margin-bottom: 12px;
}
.scene-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.trigger-info {
  font-size: 12px;
  color: #909399;
}
.scene-actions {
  display: flex;
  gap: 8px;
}
.action-item {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
.cron-help {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}
</style>
