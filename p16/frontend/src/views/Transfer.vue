<template>
  <div class="transfer">
    <el-card>
      <template #header>
        <span>产品流转</span>
      </template>
      
      <el-form :model="form" :rules="rules" ref="formRef" label-width="120px" style="max-width: 600px;">
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
        
        <el-form-item label="接收方" prop="newOwner">
          <el-input v-model="form.newOwner" placeholder="如：绿叶加工厂" />
        </el-form-item>
        
        <el-form-item label="接收方角色" prop="newOwnerRole">
          <el-select v-model="form.newOwnerRole" style="width: 100%">
            <el-option label="农场" value="farm" />
            <el-option label="加工厂" value="factory" />
            <el-option label="物流" value="logistics" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="流转地点" prop="location">
          <el-input v-model="form.location" placeholder="如：北京市朝阳区" />
        </el-form-item>
        
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="可选" />
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitForm" :loading="loading">确认流转</el-button>
          <el-button @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 20px;">
      <template #header>
        <span>最近流转记录</span>
      </template>
      <el-table :data="transferRecords" style="width: 100%">
        <el-table-column prop="produceId" label="产品ID" />
        <el-table-column prop="from" label="转出方" />
        <el-table-column prop="to" label="转入方" />
        <el-table-column prop="location" label="地点" />
        <el-table-column prop="timestamp" label="时间">
          <template #default="{ row }">{{ formatDate(row.timestamp) }}</template>
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
const transferRecords = ref([])

const form = reactive({
  produceId: '',
  newOwner: '',
  newOwnerRole: '',
  location: '',
  remark: ''
})

const rules = {
  produceId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  newOwner: [{ required: true, message: '请输入接收方', trigger: 'blur' }],
  newOwnerRole: [{ required: true, message: '请选择接收方角色', trigger: 'change' }],
  location: [{ required: true, message: '请输入流转地点', trigger: 'blur' }]
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

async function loadProduces() {
  try {
    const response = await api.get('/produce')
    produces.value = response.data
  } catch (error) {
    ElMessage.error('加载产品列表失败')
  }
}

async function loadTransferRecords() {
  try {
    const response = await api.get('/produce')
    const allRecords = []
    for (const produce of response.data) {
      const historyRes = await api.get(`/produce/${produce.id}/history`)
      historyRes.data.transfers.forEach(t => {
        allRecords.push({ ...t, produceId: produce.id })
      })
    }
    transferRecords.value = allRecords.slice(-10).reverse()
  } catch (error) {
    console.error('加载流转记录失败', error)
  }
}

async function submitForm() {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        await api.post(`/produce/${form.produceId}/transfer`, {
          newOwner: form.newOwner,
          newOwnerRole: form.newOwnerRole,
          location: form.location,
          remark: form.remark
        })
        ElMessage.success('流转成功')
        resetForm()
        loadTransferRecords()
      } catch (error) {
        ElMessage.error(error.response?.data?.error || '流转失败')
      } finally {
        loading.value = false
      }
    }
  })
}

function resetForm() {
  formRef.value?.resetFields()
  form.remark = ''
}

onMounted(() => {
  loadProduces()
  loadTransferRecords()
})
</script>
