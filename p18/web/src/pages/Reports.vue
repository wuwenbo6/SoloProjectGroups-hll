<template>
  <div class="reports">
    <div class="page-header">
      <h2 class="page-title">步态分析报告</h2>
      <el-select v-model="selectedPatient" placeholder="选择患者" clearable style="width: 200px">
        <el-option v-for="patient in patients" :key="patient.id" :label="patient.name" :value="patient.id" />
      </el-select>
    </div>

    <el-card class="table-card">
      <el-table :data="reports" stripe>
        <el-table-column prop="id" label="报告ID" width="150" />
        <el-table-column prop="patientName" label="患者姓名" width="100" />
        <el-table-column prop="sessionId" label="会话ID" width="150" />
        <el-table-column prop="createdAt" label="生成时间" width="180" />
        <el-table-column prop="totalSteps" label="总步数" width="100" />
        <el-table-column prop="avgStanceTime" label="平均支撑相(ms)" width="140" />
        <el-table-column prop="asymmetryIndex" label="不对称指数" width="120">
          <template #default="{ row }">
            <el-tag :type="row.asymmetryIndex > 10 ? 'danger' : 'success'">
              {{ row.asymmetryIndex }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="rehabScore" label="康复评分" width="120">
          <template #default="{ row }">
            <div class="score-cell">
              <el-progress
                :percentage="row.rehabScore"
                :color="getScoreColor(row.rehabScore)"
                :stroke-width="12"
                :show-text="true"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isReviewed ? 'success' : 'warning'">
              {{ row.isReviewed ? '已审核' : '待审核' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="viewReport(row)">
              查看详情
            </el-button>
            <el-button type="success" size="small" @click="downloadReport(row)">
              下载
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <el-pagination
        class="pagination"
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="reports.length"
        layout="total, prev, pager, next, jumper"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

const selectedPatient = ref('')
const currentPage = ref(1)
const pageSize = ref(10)

const patients = ref([
  { id: 'P001', name: '张三' },
  { id: 'P002', name: '李四' },
  { id: 'P003', name: '王五' }
])

const reports = ref([
  { id: 'R001', patientName: '张三', sessionId: 'S001', createdAt: '2024-01-15 14:45:00', totalSteps: 1250, avgStanceTime: 680, asymmetryIndex: 8.5, rehabScore: 78, isReviewed: true },
  { id: 'R002', patientName: '李四', sessionId: 'S002', createdAt: '2024-01-15 10:30:00', totalSteps: 980, avgStanceTime: 720, asymmetryIndex: 12.3, rehabScore: 65, isReviewed: false },
  { id: 'R003', patientName: '王五', sessionId: 'S003', createdAt: '2024-01-14 17:00:00', totalSteps: 1520, avgStanceTime: 650, asymmetryIndex: 5.2, rehabScore: 88, isReviewed: true },
  { id: 'R004', patientName: '张三', sessionId: 'S004', createdAt: '2024-01-14 09:15:00', totalSteps: 890, avgStanceTime: 780, asymmetryIndex: 15.8, rehabScore: 58, isReviewed: false },
  { id: 'R005', patientName: '李四', sessionId: 'S005', createdAt: '2024-01-13 15:35:00', totalSteps: 1100, avgStanceTime: 695, asymmetryIndex: 7.1, rehabScore: 82, isReviewed: true }
])

const getScoreColor = (score) => {
  if (score >= 85) return '#67C23A'
  if (score >= 70) return '#409EFF'
  if (score >= 60) return '#E6A23C'
  return '#F56C6C'
}

const viewReport = (row) => {
  router.push(`/report/${row.id}`)
}

const downloadReport = async (row) => {
  try {
    const response = await fetch(
      `/api/report/pdf/${row.sessionId}?userId=demo_user_001`,
      { method: 'POST' }
    )
    if (response.ok) {
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gait_report_${row.id}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
      ElMessage.success('PDF报告导出成功')
    } else {
      ElMessage.warning('PDF生成服务暂不可用')
    }
  } catch (e) {
    ElMessage.warning('PDF导出功能需要服务端支持')
  }
}
</script>

<style scoped>
.reports {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.table-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.score-cell {
  padding: 4px 0;
}
</style>
