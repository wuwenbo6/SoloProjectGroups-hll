<template>
  <div class="create-produce">
    <el-card>
      <template #header>
        <span>新增农产品</span>
      </template>
      
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px" style="max-width: 600px;">
        <el-form-item label="产品ID" prop="id">
          <el-input v-model="form.id" placeholder="如：PROD001" />
        </el-form-item>
        
        <el-form-item label="产品名称" prop="name">
          <el-input v-model="form.name" placeholder="如：有机西红柿" />
        </el-form-item>
        
        <el-form-item label="批次号" prop="batchNumber">
          <el-input v-model="form.batchNumber" placeholder="如：BATCH-2024-001" />
        </el-form-item>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="数量" prop="quantity">
              <el-input-number v-model="form.quantity" :min="0" :step="0.1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位" prop="unit">
              <el-select v-model="form.unit" style="width: 100%">
                <el-option label="kg" value="kg" />
                <el-option label="吨" value="吨" />
                <el-option label="箱" value="箱" />
                <el-option label="件" value="件" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-form-item label="图片上传">
          <el-upload
            ref="uploadRef"
            :action="uploadUrl"
            :headers="uploadHeaders"
            :on-success="handleUploadSuccess"
            :on-error="handleUploadError"
            :show-file-list="false"
            accept="image/*"
          >
            <el-button type="primary">
              <el-icon><Upload /></el-icon>
              上传图片
            </el-button>
          </el-upload>
          <div v-if="form.imageURL" class="image-preview">
            <img :src="form.imageURL" alt="预览" />
          </div>
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitForm" :loading="loading">提交</el-button>
          <el-button @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'
import api from '../api'

const router = useRouter()
const authStore = useAuthStore()
const formRef = ref(null)
const uploadRef = ref(null)
const loading = ref(false)

const uploadUrl = computed(() => `/api/upload/image/${form.value.id}`)
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${authStore.token}`
}))

const form = reactive({
  id: '',
  name: '',
  batchNumber: '',
  quantity: 0,
  unit: 'kg',
  imageURL: ''
})

const rules = {
  id: [{ required: true, message: '请输入产品ID', trigger: 'blur' }],
  name: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
  batchNumber: [{ required: true, message: '请输入批次号', trigger: 'blur' }],
  quantity: [{ required: true, message: '请输入数量', trigger: 'blur' }],
  unit: [{ required: true, message: '请选择单位', trigger: 'change' }]
}

function handleUploadSuccess(response) {
  if (response.success) {
    form.imageURL = response.imageURL
    ElMessage.success('图片上传成功')
  }
}

function handleUploadError() {
  ElMessage.error('图片上传失败')
}

async function submitForm() {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        await api.post('/produce', {
          ...form,
          owner: authStore.userName,
          ownerRole: authStore.userRole
        })
        ElMessage.success('创建成功')
        router.push('/produce')
      } catch (error) {
        ElMessage.error(error.response?.data?.error || '创建失败')
      } finally {
        loading.value = false
      }
    }
  })
}

function resetForm() {
  formRef.value?.resetFields()
  form.imageURL = ''
}
</script>

<style scoped>
.image-preview {
  margin-top: 10px;
}

.image-preview img {
  max-width: 200px;
  max-height: 200px;
  border-radius: 4px;
  border: 1px solid #ebeef5;
}
</style>
