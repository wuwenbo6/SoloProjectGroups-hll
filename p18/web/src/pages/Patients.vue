<template>
  <div class="patients">
    <div class="page-header">
      <h2 class="page-title">患者管理</h2>
      <el-button type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon>
        添加患者
      </el-button>
    </div>

    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm">
        <el-form-item label="患者姓名">
          <el-input v-model="searchForm.name" placeholder="请输入姓名" clearable />
        </el-form-item>
        <el-form-item label="检测状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable>
            <el-option label="正常" value="normal" />
            <el-option label="异常" value="abnormal" />
            <el-option label="待检测" value="pending" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">搜索</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table :data="filteredPatients" stripe>
        <el-table-column prop="id" label="ID" width="100" />
        <el-table-column prop="name" label="患者姓名" width="120" />
        <el-table-column prop="age" label="年龄" width="80" />
        <el-table-column prop="gender" label="性别" width="80" />
        <el-table-column prop="lastSession" label="最近检测时间" width="180" />
        <el-table-column prop="sessionCount" label="检测次数" width="100" />
        <el-table-column prop="status" label="步态状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="viewDetail(row)">
              详情
            </el-button>
            <el-button type="success" size="small" @click="viewReports(row)">
              报告
            </el-button>
            <el-button type="warning" size="small" @click="editPatient(row)">
              编辑
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <el-pagination
        class="pagination"
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="patients.length"
        layout="total, prev, pager, next, jumper"
        @current-change="handlePageChange"
      />
    </el-card>

    <el-dialog v-model="showAddDialog" title="添加患者" width="500px">
      <el-form :model="patientForm" label-width="80px">
        <el-form-item label="姓名">
          <el-input v-model="patientForm.name" />
        </el-form-item>
        <el-form-item label="年龄">
          <el-input-number v-model="patientForm.age" :min="1" :max="120" />
        </el-form-item>
        <el-form-item label="性别">
          <el-radio-group v-model="patientForm.gender">
            <el-radio label="男">男</el-radio>
            <el-radio label="女">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="patientForm.notes" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="addPatient">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

const searchForm = ref({
  name: '',
  status: ''
})

const showAddDialog = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)

const patientForm = ref({
  name: '',
  age: 50,
  gender: '男',
  notes: ''
})

const patients = ref([
  { id: 'P001', name: '张三', age: 65, gender: '男', lastSession: '2024-01-15 14:30', sessionCount: 12, status: 'normal' },
  { id: 'P002', name: '李四', age: 58, gender: '女', lastSession: '2024-01-15 10:15', sessionCount: 8, status: 'abnormal' },
  { id: 'P003', name: '王五', age: 72, gender: '男', lastSession: '2024-01-14 16:45', sessionCount: 25, status: 'normal' },
  { id: 'P004', name: '赵六', age: 45, gender: '男', lastSession: '2024-01-14 09:00', sessionCount: 3, status: 'pending' },
  { id: 'P005', name: '钱七', age: 61, gender: '女', lastSession: '2024-01-13 15:20', sessionCount: 18, status: 'abnormal' },
  { id: 'P006', name: '孙八', age: 55, gender: '男', lastSession: '2024-01-12 11:30', sessionCount: 10, status: 'normal' },
  { id: 'P007', name: '周九', age: 68, gender: '女', lastSession: '2024-01-11 14:00', sessionCount: 15, status: 'normal' },
  { id: 'P008', name: '吴十', age: 52, gender: '男', lastSession: '2024-01-10 09:45', sessionCount: 6, status: 'pending' }
])

const filteredPatients = computed(() => {
  let result = patients.value
  
  if (searchForm.value.name) {
    result = result.filter(p => p.name.includes(searchForm.value.name))
  }
  
  if (searchForm.value.status) {
    result = result.filter(p => p.status === searchForm.value.status)
  }
  
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return result.slice(start, end)
})

const getStatusType = (status) => {
  const types = {
    normal: 'success',
    abnormal: 'danger',
    pending: 'warning'
  }
  return types[status] || 'info'
}

const getStatusText = (status) => {
  const texts = {
    normal: '正常',
    abnormal: '异常',
    pending: '待检测'
  }
  return texts[status] || status
}

const search = () => {
  currentPage.value = 1
}

const resetSearch = () => {
  searchForm.value = { name: '', status: '' }
  currentPage.value = 1
}

const handlePageChange = (page) => {
  currentPage.value = page
}

const viewDetail = (row) => {
  ElMessage.info(`查看患者 ${row.name} 详情`)
}

const viewReports = (row) => {
  router.push('/reports')
}

const editPatient = (row) => {
  patientForm.value = { ...row }
  showAddDialog.value = true
}

const addPatient = () => {
  const newPatient = {
    id: `P${String(patients.value.length + 1).padStart(3, '0')}`,
    ...patientForm.value,
    lastSession: '-',
    sessionCount: 0,
    status: 'pending'
  }
  patients.value.unshift(newPatient)
  showAddDialog.value = false
  patientForm.value = { name: '', age: 50, gender: '男', notes: '' }
  ElMessage.success('患者添加成功')
}
</script>

<style scoped>
.patients {
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

.search-card {
  border: none;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  margin-bottom: 20px;
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
</style>
