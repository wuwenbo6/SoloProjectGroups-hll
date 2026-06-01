<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <div class="header-content">
        <div class="logo">
          <el-icon :size="28" color="#409eff"><Monitor /></el-icon>
          <span class="title">KVM虚拟机备份管理系统</span>
        </div>
        <el-menu
          mode="horizontal"
          :default-active="activeMenu"
          class="nav-menu"
          @select="handleMenuSelect"
        >
          <el-menu-item index="/">
            <el-icon><Monitor /></el-icon>
            <span>虚拟机</span>
          </el-menu-item>
          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <span>系统设置</span>
          </el-menu-item>
        </el-menu>
      </div>
    </el-header>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Monitor, Setting } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()

const activeMenu = computed(() => {
  if (route.path.startsWith('/settings')) return '/settings'
  return '/'
})

const handleMenuSelect = (index) => {
  router.push(index)
}
</script>

<style scoped>
.app-container {
  min-height: 100vh;
}

.app-header {
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 0 20px;
}

.header-content {
  display: flex;
  align-items: center;
  height: 100%;
  gap: 40px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.nav-menu {
  flex: 1;
  border-bottom: none;
}

.app-main {
  padding: 20px;
}
</style>
