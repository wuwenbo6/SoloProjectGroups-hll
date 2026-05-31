<template>
  <div class="devices">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>设备列表</span>
        </div>
      </template>
      
      <el-table :data="devices" v-loading="loading" stripe>
        <el-table-column prop="device_id" label="设备ID" width="200" />
        <el-table-column prop="name" label="设备名称" width="150" />
        <el-table-column prop="type" label="设备类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getTypeColor(row.type)">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="room" label="房间" width="120" />
        <el-table-column prop="online" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.online ? 'success' : 'info'">
              {{ row.online ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_seen" label="最后在线" width="180">
          <template #default="{ row }">
            {{ formatDate(row.last_seen) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="280">
          <template #default="{ row }">
            <el-button size="small" @click="viewHistory(row)">
              历史数据
            </el-button>
            <el-button size="small" type="primary" @click="controlDevice(row)">
              设备控制
            </el-button>
            <el-button size="small" @click="editDevice(row)">
              编辑
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="historyDialog" title="历史数据" width="900">
      <el-select v-model="selectedType" placeholder="选择数据类型" style="width: 200px; margin-bottom: 20px">
        <el-option label="全部" value="" />
        <el-option label="温度" value="temperature" />
        <el-option label="湿度" value="humidity" />
        <el-option label="电源" value="power" />
      </el-select>
      <el-table :data="historyData" stripe max-height="400">
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column prop="value" label="数值" width="120" />
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column prop="timestamp" label="时间">
          <template #default="{ row }">
            {{ formatDate(row.timestamp) }}
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="controlDialog" title="设备控制" width="500">
      <el-form label-width="100px">
        <el-form-item label="设备名称">
          <span>{{ currentDevice?.name }}</span>
        </el-form-item>
        <el-form-item label="电源控制">
          <el-switch v-model="controlForm.power" active-text="开" inactive-text="关" />
        </el-form-item>
        <el-form-item v-if="currentDevice?.type === 'fan'" label="风速">
          <el-slider v-model="controlForm.speed" :min="1" :max="5" />
        </el-form-item>
        <el-form-item v-if="currentDevice?.type === 'light'" label="亮度">
          <el-slider v-model="controlForm.brightness" :min="1" :max="100" />
        </el-form-item>
        <el-form-item v-if="currentDevice?.type === 'thermostat'" label="目标温度">
          <el-input-number v-model="controlForm.targetTemp" :min="16" :max="30" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="controlDialog = false">取消</el-button>
        <el-button type="primary" @click="sendControlCommand">发送指令</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialog" title="编辑设备" width="500">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="设备名称">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="设备类型">
          <el-select v-model="editForm.type" style="width: 100%">
            <el-option label="温度传感器" value="temperature" />
            <el-option label="湿度传感器" value="humidity" />
            <el-option label="风扇" value="fan" />
            <el-option label="灯光" value="light" />
            <el-option label="空调" value="thermostat" />
          </el-select>
        </el-form-item>
        <el-form-item label="房间">
          <el-input v-model="editForm.room" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialog = false">取消</el-button>
        <el-button type="primary" @click="saveDevice">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getDevices, getSensorHistory, sendCommand, updateDevice } from '@/api'

const devices = ref([])
const loading = ref(false)
const historyDialog = ref(false)
const controlDialog = ref(false)
const editDialog = ref(false)
const currentDevice = ref(null)
const historyData = ref([])
const selectedType = ref('')

const controlForm = reactive({
  power: false,
  speed: 3,
  brightness: 50,
  targetTemp: 24
})

const editForm = reactive({
  name: '',
  type: '',
  room: ''
})

const getTypeColor = (type) => {
  const colors = {
    temperature: 'danger',
    humidity: 'primary',
    fan: 'warning',
    light: 'success',
    thermostat: 'info'
  }
  return colors[type] || ''
}

const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const loadDevices = async () => {
  loading.value = true
  try {
    const res = await getDevices()
    devices.value = res.data
  } catch (e) {
    ElMessage.error('加载设备失败')
  } finally {
    loading.value = false
  }
}

const viewHistory = async (device) => {
  currentDevice.value = device
  historyDialog.value = true
  try {
    const res = await getSensorHistory(device.device_id, 50)
    historyData.value = res.data
  } catch (e) {
    ElMessage.error('加载历史数据失败')
  }
}

const controlDevice = (device) => {
  currentDevice.value = device
  controlForm.power = device.status === 'on'
  controlDialog.value = true
}

const sendControlCommand = async () => {
  if (!currentDevice.value) return
  
  try {
    await sendCommand(currentDevice.value.device_id, controlForm)
    ElMessage.success('指令发送成功')
    controlDialog.value = false
  } catch (e) {
    ElMessage.error('指令发送失败')
  }
}

const editDevice = (device) => {
  currentDevice.value = device
  editForm.name = device.name
  editForm.type = device.type
  editForm.room = device.room
  editDialog.value = true
}

const saveDevice = async () => {
  if (!currentDevice.value) return
  
  try {
    await updateDevice(currentDevice.value.device_id, editForm)
    ElMessage.success('保存成功')
    editDialog.value = false
    loadDevices()
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

onMounted(() => {
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
</style>
