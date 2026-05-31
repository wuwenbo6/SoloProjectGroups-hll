<template>
  <div class="dashboard">
    <h3>系统概览</h3>
    
    <el-row :gutter="20" style="margin-bottom: 20px;">
      <el-col :span="6">
        <el-card>
          <div style="text-align: center;">
            <el-icon size="40" color="#409EFF"><User /></el-icon>
            <div style="font-size: 24px; margin: 10px 0;">{{ stats.userCount }}</div>
            <div style="color: #909399;">用户总数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div style="text-align: center;">
            <el-icon size="40" color="#67C23A"><Box /></el-icon>
            <div style="font-size: 24px; margin: 10px 0;">{{ stats.pillboxCount }}</div>
            <div style="color: #909399;">药盒总数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div style="text-align: center;">
            <el-icon size="40" color="#E6A23C"><Calendar /></el-icon>
            <div style="font-size: 24px; margin: 10px 0;">{{ stats.planCount }}</div>
            <div style="color: #909399;">用药计划</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div style="text-align: center;">
            <el-icon size="40" color="#F56C6C"><List /></el-icon>
            <div style="font-size: 24px; margin: 10px 0;">{{ stats.missedCount }}</div>
            <div style="color: #909399;">未服药提醒</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>在线药盒状态</span>
          </template>
          <el-table :data="pillboxes" stripe>
            <el-table-column prop="name" label="药盒名称" />
            <el-table-column prop="device_id" label="设备ID" />
            <el-table-column label="状态">
              <template #default="scope">
                <el-tag :type="scope.row.is_online ? 'success' : 'danger'">
                  {{ scope.row.is_online ? '在线' : '离线' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>最近服药记录</span>
          </template>
          <el-table :data="recentRecords" stripe>
            <el-table-column prop="user_id" label="用户ID" width="80" />
            <el-table-column prop="scheduled_time" label="计划时间" width="150">
              <template #default="scope">
                {{ formatTime(scope.row.scheduled_time) }}
              </template>
            </el-table-column>
            <el-table-column label="状态">
              <template #default="scope">
                <el-tag :type="scope.row.is_taken ? 'success' : 'warning'">
                  {{ scope.row.is_taken ? '已服药' : '待服药' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import dayjs from 'dayjs'
import { userApi, pillboxApi, planApi, recordApi } from '../api'

const stats = ref({
  userCount: 0,
  pillboxCount: 0,
  planCount: 0,
  missedCount: 0
})

const pillboxes = ref([])
const recentRecords = ref([])

const formatTime = (time) => {
  return dayjs(time).format('YYYY-MM-DD HH:mm')
}

const loadData = async () => {
  try {
    const [usersRes, pillboxesRes, plansRes, recordsRes] = await Promise.all([
      userApi.list(),
      pillboxApi.list(),
      planApi.list(),
      recordApi.list(null, 10)
    ])
    
    stats.value.userCount = usersRes.data.length
    stats.value.pillboxCount = pillboxesRes.data.length
    stats.value.planCount = plansRes.data.length
    stats.value.missedCount = recordsRes.data.filter(r => !r.is_taken).length
    
    pillboxes.value = pillboxesRes.data
    recentRecords.value = recordsRes.data
  } catch (error) {
    console.error('加载数据失败:', error)
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.dashboard h3 {
  margin-bottom: 20px;
  font-size: 20px;
}
</style>
