<template>
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <div class="card-header">
          <h2>农产品溯源系统</h2>
          <p>Produce Traceability System</p>
        </div>
      </template>
      
      <el-form :model="loginForm" :rules="rules" ref="loginFormRef" @submit.prevent="handleLogin">
        <el-form-item prop="username">
          <el-input v-model="loginForm.username" placeholder="用户名" prefix-icon="User" size="large" />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input v-model="loginForm.password" type="password" placeholder="密码" prefix-icon="Lock" size="large" show-password />
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="handleLogin">
            登 录
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="demo-accounts">
        <p>演示账号：</p>
        <ul>
          <li>农场：farm_admin / farm123</li>
          <li>加工厂：factory_admin / factory123</li>
          <li>物流：logistics_admin / logistics123</li>
          <li>质检员：inspector / inspector123</li>
        </ul>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'

const router = useRouter()
const authStore = useAuthStore()
const loginFormRef = ref(null)
const loading = ref(false)

const loginForm = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function handleLogin() {
  if (!loginFormRef.value) return
  
  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      const success = await authStore.login(loginForm.username, loginForm.password)
      loading.value = false
      
      if (success) {
        ElMessage.success('登录成功')
        router.push('/')
      } else {
        ElMessage.error('用户名或密码错误')
      }
    }
  })
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 400px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
}

.card-header {
  text-align: center;
}

.card-header h2 {
  margin: 0 0 5px 0;
  color: #303133;
}

.card-header p {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.demo-accounts {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;
}

.demo-accounts p {
  margin: 0 0 10px 0;
  color: #606266;
  font-size: 14px;
}

.demo-accounts ul {
  margin: 0;
  padding-left: 20px;
  color: #909399;
  font-size: 12px;
}

.demo-accounts li {
  margin-bottom: 5px;
}
</style>
