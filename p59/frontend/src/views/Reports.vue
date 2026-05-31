<template>
  <div class="reports">
    <h3 style="margin-bottom: 20px;">服药报告</h3>

    <el-row :gutter="20" style="margin-bottom: 20px;">
      <el-col :span="6">
        <el-card>
          <template #header>
            <span>选择用户</span>
          </template>
          <el-select v-model="selectedUserId" placeholder="全部用户" clearable style="width: 100%;">
            <el-option
              v-for="user in users"
              :key="user.id"
              :label="user.name"
              :value="user.id"
            />
          </el-select>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <template #header>
            <span>时间范围</span>
          </template>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 100%;"
          />
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card>
          <template #header>
            <span>操作</span>
          </template>
          <el-button type="primary" @click="loadSummary">
            <el-icon><Refresh /></el-icon>
            查询统计
          </el-button>
          <el-button type="success" @click="exportCsv" :disabled="!hasData">
            <el-icon><Download /></el-icon>
            导出CSV
          </el-button>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-bottom: 20px;" v-if="summary">
      <el-col :span="6">
        <el-card>
          <div style="text-align: center;">
            <el-icon size="40" color="#409EFF"><Document /></el-icon>
            <div style="font-size: 24px; margin: 10px 0;">{{ summary.total_records }}</div>
            <div style="color: #909399;">总记录数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div style="text-align: center;">
            <el-icon size="40" color="#67C23A"><CircleCheck /></el-icon>
            <div style="font-size: 24px; margin: 10px 0;">{{ summary.taken_count }}</div>
            <div style="color: #909399;">已服药</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div style="text-align: center;">
            <el-icon size="40" color="#F56C6C"><Warning /></el-icon>
            <div style="font-size: 24px; margin: 10px 0;">{{ summary.missed_count }}</div>
            <div style="color: #909399;">漏服</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div style="text-align: center;">
            <el-icon size="40" color="#E6A23C"><TrendCharts /></el-icon>
            <div style="font-size: 24px; margin: 10px 0;">{{ summary.adherence_rate }}%</div>
            <div style="color: #909399;">依从率</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card>
      <template #header>
        <span>服药记录明细</span>
      </template>
      <el-table :data="records" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="user_id" label="用户ID" width="100" />
        <el-table-column label="药品名称" width="150">
          <template #default="scope">
            {{ getMedicineName(scope.row.plan_id) }}
          </template>
        </el-table-column>
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
        <el-table-column prop="pills_taken" label="服药片数" width="100" />
        <el-table-column label="状态" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.is_taken ? 'success' : (isMissed(scope.row) ? 'danger' : 'warning')">
              {{ scope.row.is_taken ? '已服药' : (isMissed(scope.row) ? '漏服' : '待服药' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="语音播放" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.tts_played ? 'success' : 'info'" effect="plain">
              {{ scope.row.tts_played ? '已播放' : '未播放' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="scope">
            <el-button size="small" @click="playReminder(scope.row.id)" :disabled="scope.row.tts_played">
              播放提醒
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty description="暂无数据，请选择条件后查询" v-if="!loading && records.length === 0" :image-size="100" />
    </el-card>

    <audio ref="audioPlayer" style="display: none;"></audio>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { userApi, recordApi, reportApi, ttsApi, planApi } from '../api'
import dayjs from 'dayjs'

const users = ref([])
const plans = ref([])
const records = ref([])
const summary = ref(null)
const selectedUserId = ref(null)
const dateRange = ref([
  dayjs().subtract(30, 'day').toDate(),
  dayjs().toDate()
])
const loading = ref(false)
const audioPlayer = ref(null)

const hasData = computed(() => records.value.length > 0)

const formatTime = (time) => {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

const isMissed = (record) => {
  if (record.is_taken) return false
  return dayjs().diff(dayjs(record.scheduled_time), 'minute') > 30
}

const getMedicineName = (planId) => {
  const plan = plans.value.find(p => p.id === planId)
  return plan ? plan.medicine_name : '-'
}

const loadUsers = async () => {
  try {
    const res = await userApi.list()
    users.value = res.data
  } catch (error) {
    console.error('加载用户失败:', error)
  }
}

const loadPlans = async () => {
  try {
    const res = await planApi.list()
    plans.value = res.data
  } catch (error) {
    console.error('加载计划失败:', error)
  }
}

const loadSummary = async () => {
  if (!dateRange.value || dateRange.value.length < 2) {
    ElMessage.warning('请选择时间范围')
    return
  }

  loading.value = true
  try {
    const [summaryRes, recordsRes] = await Promise.all([
      reportApi.getSummary(
        selectedUserId.value,
        dateRange.value[0],
        dateRange.value[1]
      ),
      recordApi.list(selectedUserId.value, 100)
    ])
    summary.value = summaryRes.data
    records.value = recordsRes.data
  } catch (error) {
    ElMessage.error('加载统计数据失败')
  } finally {
    loading.value = false
  }
}

const exportCsv = async () => {
  if (!dateRange.value || dateRange.value.length < 2) {
    ElMessage.warning('请选择时间范围')
    return
  }

  try {
    const res = await reportApi.exportCsv(
      selectedUserId.value,
      dateRange.value[0],
      dateRange.value[1]
    )
    
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href = url
    link.download = `服药报告_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    
    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.error('导出失败')
  }
}

const playReminder = async (recordId) => {
  try {
    const res = await ttsApi.getReminder(recordId)
    const url = window.URL.createObjectURL(new Blob([res.data]))
    if (audioPlayer.value) {
      audioPlayer.value.src = url
      audioPlayer.value.play()
    }
    ElMessage.success('正在播放语音提醒')
    loadSummary()
  } catch (error) {
    ElMessage.error('播放失败，请确保TTS服务可用')
  }
}

onMounted(() => {
  loadUsers()
  loadPlans()
  loadSummary()
})
</script>
