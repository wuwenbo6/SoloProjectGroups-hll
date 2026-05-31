<template>
  <el-container class="main-container">
    <el-aside width="220px" class="sidebar">
      <div class="logo">
        <h3>农产品溯源</h3>
      </div>
      <el-menu
        :default-active="activeMenu"
        class="sidebar-menu"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <el-menu-item index="/">
          <el-icon><DataAnalysis /></el-icon>
          <span>数据概览</span>
        </el-menu-item>
        <el-menu-item index="/produce">
          <el-icon><Goods /></el-icon>
          <span>农产品列表</span>
        </el-menu-item>
        <el-menu-item v-if="isFarmOrFactory" index="/produce/create">
          <el-icon><Plus /></el-icon>
          <span>新增农产品</span>
        </el-menu-item>
        <el-menu-item v-if="canTransfer" index="/transfer">
          <el-icon><Transfer /></el-icon>
          <span>流转管理</span>
        </el-menu-item>
        <el-menu-item v-if="isInspectorOrFactory" index="/inspection">
          <el-icon><DocumentChecked /></el-icon>
          <span>质检报告</span>
        </el-menu-item>
        <el-menu-item index="/temperature">
          <el-icon><Guide /></el-icon>
          <span>温度监测</span>
        </el-menu-item>
        <el-menu-item index="/certificate">
          <el-icon><Tickets /></el-icon>
          <span>证书管理</span>
        </el-menu-item>
        <el-menu-item index="/scan">
          <el-icon><Camera /></el-icon>
          <span>扫码溯源</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ pageTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-icon><User /></el-icon>
              {{ userName }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const activeMenu = computed(() => route.path)
const userName = computed(() => authStore.userName)
const userRole = computed(() => authStore.userRole)

const isFarmOrFactory = computed(() => 
  userRole.value === 'farm' || userRole.value === 'factory'
)

const canTransfer = computed(() => 
  userRole.value === 'farm' || userRole.value === 'factory' || userRole.value === 'logistics'
)

const isInspectorOrFactory = computed(() => 
  userRole.value === 'inspector' || userRole.value === 'factory'
)

const pageTitle = computed(() => {
  const titles = {
    '/': '数据概览',
    '/produce': '农产品列表',
    '/produce/create': '新增农产品',
    '/transfer': '流转管理',
    '/inspection': '质检报告',
    '/scan': '扫码溯源'
  }
  return titles[route.path] || '溯源系统'
})

function handleCommand(command) {
  if (command === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      authStore.logout()
      router.push('/login')
    }).catch(() => {})
  }
}
</script>

<style scoped>
.main-container {
  height: 100vh;
}

.sidebar {
  background-color: #304156;
  overflow: hidden;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #2b2f3a;
}

.logo h3 {
  color: #fff;
  margin: 0;
  font-size: 18px;
}

.sidebar-menu {
  border-right: none;
}

.header {
  background-color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #606266;
}

.main-content {
  background-color: #f0f2f5;
  padding: 20px;
}
</style>
