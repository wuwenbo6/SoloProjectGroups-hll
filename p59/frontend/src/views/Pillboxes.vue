<template>
  <div class="pillboxes">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h3>药盒管理</h3>
      <el-button type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon>
        添加药盒
      </el-button>
    </div>

    <el-card>
      <el-table :data="pillboxes" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="药盒名称" />
        <el-table-column prop="device_id" label="设备ID" />
        <el-table-column prop="user_id" label="用户ID" width="100" />
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.is_online ? 'success' : 'danger'">
              {{ scope.row.is_online ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_heartbeat" label="最后心跳">
          <template #default="scope">
            {{ scope.row.last_heartbeat ? formatTime(scope.row.last_heartbeat) : '-' }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showAddDialog" title="添加药盒" width="400px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="药盒名称">
          <el-input v-model="form.name" placeholder="请输入药盒名称" />
        </el-form-item>
        <el-form-item label="设备ID">
          <el-input v-model="form.device_id" placeholder="请输入设备ID" />
        </el-form-item>
        <el-form-item label="所属用户">
          <el-select v-model="form.user_id" placeholder="请选择用户" style="width: 100%;">
            <el-option
              v-for="user in users"
              :key="user.id"
              :label="user.name"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="addPillbox">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { pillboxApi, userApi } from '../api'

const pillboxes = ref([])
const users = ref([])
const showAddDialog = ref(false)
const form = ref({
  name: '',
  device_id: '',
  user_id: null
})

const formatTime = (time) => {
  return dayjs(time).format('YYYY-MM-DD HH:mm')
}

const loadPillboxes = async () => {
  try {
    const res = await pillboxApi.list()
    pillboxes.value = res.data
  } catch (error) {
    console.error('加载药盒失败:', error)
  }
}

const loadUsers = async () => {
  try {
    const res = await userApi.list()
    users.value = res.data
  } catch (error) {
    console.error('加载用户失败:', error)
  }
}

const addPillbox = async () => {
  if (!form.value.name || !form.value.device_id || !form.value.user_id) {
    ElMessage.warning('请填写完整信息')
    return
  }
  try {
    await pillboxApi.create(form.value)
    ElMessage.success('添加成功')
    showAddDialog.value = false
    form.value = { name: '', device_id: '', user_id: null }
    loadPillboxes()
  } catch (error) {
    ElMessage.error('添加失败')
  }
}

onMounted(() => {
  loadPillboxes()
  loadUsers()
})
</script>
