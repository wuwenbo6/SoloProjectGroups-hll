<template>
  <el-container class="app-container">
    <el-aside width="220px" class="sidebar">
      <div class="logo">
        <el-icon :size="32" color="#409eff"><Cpu /></el-icon>
        <span class="logo-text">Ceph RBD 管理</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        class="sidebar-menu"
        router
        background-color="transparent"
        text-color="#333"
        active-text-color="#409eff"
      >
        <el-menu-item index="/">
          <el-icon><DataBoard /></el-icon>
          <span>概览</span>
        </el-menu-item>
        <el-menu-item index="/images">
          <el-icon><Folder /></el-icon>
          <span>镜像管理</span>
        </el-menu-item>
        <el-menu-item index="/snapshot-tree">
          <el-icon><Share /></el-icon>
          <span>快照树</span>
        </el-menu-item>
        <el-menu-item index="/clone-chain">
          <el-icon><Link /></el-icon>
          <span>克隆链</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="header-title">{{ pageTitle }}</div>
        <div class="header-actions">
          <el-button type="primary" @click="refresh" :icon="Refresh" :loading="loading">
            刷新
          </el-button>
        </div>
      </el-header>
      <el-main class="main-content">
        <router-view @refresh="refresh" :key="$route.fullPath" />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Cpu, DataBoard, Folder, Share, Link, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const route = useRoute()
const loading = ref(false)

const activeMenu = computed(() => route.path)

const pageTitle = computed(() => {
  const titles = {
    '/': '系统概览',
    '/images': '镜像管理',
    '/snapshot-tree': '快照树视图',
    '/clone-chain': '克隆链视图'
  }
  return titles[route.path] || 'Ceph RBD 管理系统'
})

const refresh = () => {
  loading.value = true
  setTimeout(() => {
    loading.value = false
    ElMessage.success('已刷新')
    window.location.reload()
  }, 500)
}
</script>

<style scoped>
.app-container {
  height: 100%;
}

.sidebar {
  background: #f5f7fa;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
}

.logo {
  display: flex;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 10px;
}

.logo-text {
  margin-left: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.sidebar-menu {
  border-right: none;
  flex: 1;
}

.header {
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.main-content {
  background: #f5f7fa;
  padding: 24px;
  overflow-y: auto;
}
</style>
