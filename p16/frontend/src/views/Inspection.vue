<template>
  <div class="inspection">
    <el-card>
      <template #header>
        <span>添加质检报告</span>
      </template>
      
      <el-form :model="form" :rules="rules" ref="formRef" label-width="120px" style="max-width: 700px;">
        <el-form-item label="选择产品" prop="produceId">
          <el-select v-model="form.produceId" style="width: 100%" filterable placeholder="请选择产品">
            <el-option 
              v-for="produce in produces" 
              :key="produce.id" 
              :label="`${produce.name} - ${produce.batchNumber}`"
              :value="produce.id"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="报告编号" prop="reportID">
          <el-input v-model="form.reportID" placeholder="如：RPT2024001" />
        </el-form-item>
        
        <el-form-item label="质检员">
          <el-input v-model="form.inspector" placeholder="质检员姓名" />
        </el-form-item>
        
        <el-form-item label="检测项目">
          <div class="inspection-items">
            <div v-for="(item, index) in form.items" :key="index" class="item-row">
              <el-input v-model="item.name" placeholder="项目名称" style="flex: 1;" />
              <el-input v-model="item.result" placeholder="检测结果" style="flex: 1; margin: 0 10px;" />
              <el-button type="danger" link @click="removeItem(index)">删除</el-button>
            </div>
            <el-button type="primary" link @click="addItem">+ 添加检测项目</el-button>
          </div>
        </el-form-item>
        
        <el-form-item label="检测结论" prop="conclusion">
          <el-radio-group v-model="form.conclusion">
            <el-radio label="合格">合格</el-radio>
            <el-radio label="不合格">不合格</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitForm" :loading="loading">提交报告</el-button>
          <el-button @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 20px;">
      <template #header>
        <span>质检报告列表</span>
      </template>
      <el-table :data="reports" style="width: 100%">
        <el-table-column prop="id" label="报告编号" />
        <el-table-column prop="produceID" label="产品ID" />
        <el-table-column prop="inspector" label="质检员" />
        <el-table-column prop="conclusion" label="结论">
          <template #default="{ row }">
            <el-tag :type="row.conclusion === '合格' ? 'success' : 'danger'">
              {{ row.conclusion }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="inspectionDate" label="检测日期">
          <template #default="{ row }">{{ formatDate(row.inspectionDate) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const formRef = ref(null)
const loading = ref(false)
const produces = ref([])
const reports = ref([])

const form = reactive({
  produceId: '',
  reportID: '',
  inspector: '',
  items: [{ name: '', result: '' }],
  conclusion: '合格'
})

const rules = {
  produceId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  reportID: [{ required: true, message: '请输入报告编号', trigger: 'blur' }],
  conclusion: [{ required: true, message: '请选择检测结论', trigger: 'change' }]
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

function addItem() {
  form.items.push({ name: '', result: '' })
}

function removeItem(index) {
  if (form.items.length > 1) {
    form.items.splice(index, 1)
  } else {
    ElMessage.warning('至少保留一个检测项目')
  }
}

async function loadProduces() {
  try {
    const response = await api.get('/produce')
    produces.value = response.data
  } catch (error) {
    ElMessage.error('加载产品列表失败')
  }
}

async function loadReports() {
  try {
    const response = await api.get('/produce')
    const allReports = []
    for (const produce of response.data) {
      const historyRes = await api.get(`/produce/${produce.id}/history`)
      allReports.push(...historyRes.data.reports)
    }
    reports.value = allReports.reverse()
  } catch (error) {
    console.error('加载报告列表失败', error)
  }
}

async function submitForm() {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const items = form.items.map(i => i.name).filter(n => n)
        const results = form.items.map(i => i.result).filter(r => r)
        
        await api.post(`/produce/${form.produceId}/report`, {
          reportID: form.reportID,
          inspector: form.inspector,
          items,
          results,
          conclusion: form.conclusion,
          reportURL: ''
        })
        ElMessage.success('报告提交成功')
        resetForm()
        loadReports()
      } catch (error) {
        ElMessage.error(error.response?.data?.error || '提交失败')
      } finally {
        loading.value = false
      }
    }
  })
}

function resetForm() {
  formRef.value?.resetFields()
  form.items = [{ name: '', result: '' }]
  form.conclusion = '合格'
}

onMounted(() => {
  loadProduces()
  loadReports()
})
</script>

<style scoped>
.inspection-items {
  width: 100%;
}

.item-row {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
</style>
