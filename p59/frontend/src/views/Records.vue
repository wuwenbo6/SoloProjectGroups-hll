<template>
  <div class="records">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h3>服药记录</h3>
      <el-select v-model="selectedUserId" placeholder="选择用户" clearable @change="loadRecords" style="width: 200px;">
        <el-option
          v-for="user in users"
          :key="user.id"
          :label="user.name"
          :value="user.id"
        />
      </el-select>
    </div>

    <el-card>
      <el-table :data="records" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="user_id" label="用户ID" width="100" />
        <el-table-column prop="plan_id" label="计划ID" width="100" />
        <el-table-column prop="pillbox_id" label="药盒ID" width="100" />
        <el-table-column prop="scheduled_time" label="计划时间" width="180">
          <template #default="scope">
            {{ formatTime(scope.row.scheduled_time) }}
          </template>
        </el-table-column>
        <el-table-column prop="actual_time" label="实际时间" width="180">
          <template #default="scope">
            {{ scope.row.actual_time ? formatTime(scope.row.actual_time) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.is_taken ? 'success' : (isMissed(scope.row) ? 'danger' : 'warning')">
              {{ scope.row.is_taken ? '已服药' : (isMissed(scope.row) ? '漏服' : '待服药') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="已通知" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.is_notified ? 'info' : 'info'" effect="plain">
              {{ scope.row.is_notified ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import dayjs from 'dayjs'
import { recordApi, userApi } from '../api'

const records = ref([])
const users = ref([])
const selectedUserId = ref(null)

const formatTime = (time) => {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

const isMissed = (record) => {
  if (record.is_taken) return false
  const scheduled = dayjs(record.scheduled_time)
  const now = dayjs()
  return now.diff(scheduled, 'minute') > 30
}

const loadRecords = async () => {
  try {
    const res = await recordApi.list(selectedUserId.value)
    records.value = res.data
  } catch (error) {
    console.error('加载记录失败:', error)
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

onMounted(() => {
  loadRecords()
  loadUsers()
})
</script>
