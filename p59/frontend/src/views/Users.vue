<template>
  <div class="users">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h3>用户管理</h3>
      <el-button type="primary" @click="openDialog(false)">
        <el-icon><Plus /></el-icon>
        添加用户
      </el-button>
    </div>

    <el-card>
      <el-table :data="users" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="姓名" />
        <el-table-column prop="wechat_openid" label="微信OpenID" min-width="150" />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column label="语音提醒" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.tts_enabled ? 'success' : 'info'">
              {{ scope.row.tts_enabled ? '已开启' : '已关闭' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="scope">
            {{ formatTime(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="scope">
            <el-button size="small" @click="openDialog(true, scope.row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showDialog" :title="isEdit ? '编辑用户' : '添加用户'" width="450px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="姓名">
          <el-input v-model="form.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="微信OpenID">
          <el-input v-model="form.wechat_openid" placeholder="请输入微信OpenID" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="语音提醒">
          <el-switch v-model="form.tts_enabled" />
          <span style="margin-left: 10px; color: #909399;">启用TTS语音提醒</span>
        </el-form-item>
        <el-form-item label="语音类型" v-if="form.tts_enabled">
          <el-select v-model="form.tts_voice" placeholder="选择语音" style="width: 100%;">
            <el-option label="默认语音" value="default" />
            <el-option label="男声" value="male" />
            <el-option label="女声" value="female" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="saveUser">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { userApi } from '../api'

const users = ref([])
const showDialog = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const form = ref({
  name: '',
  wechat_openid: '',
  phone: '',
  tts_enabled: false,
  tts_voice: 'default'
})

const formatTime = (time) => {
  return dayjs(time).format('YYYY-MM-DD HH:mm')
}

const loadUsers = async () => {
  try {
    const res = await userApi.list()
    users.value = res.data
  } catch (error) {
    console.error('加载用户失败:', error)
  }
}

const openDialog = (edit, user = null) => {
  isEdit.value = edit
  if (edit && user) {
    editId.value = user.id
    form.value = { ...user }
  } else {
    form.value = {
      name: '',
      wechat_openid: '',
      phone: '',
      tts_enabled: false,
      tts_voice: 'default'
    }
  }
  showDialog.value = true
}

const saveUser = async () => {
  if (!form.value.name) {
    ElMessage.warning('请输入姓名')
    return
  }
  try {
    if (isEdit.value) {
      await userApi.update(editId.value, form.value)
      ElMessage.success('更新成功')
    } else {
      await userApi.create(form.value)
      ElMessage.success('添加成功')
    }
    showDialog.value = false
    loadUsers()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

onMounted(() => {
  loadUsers()
})
</script>
