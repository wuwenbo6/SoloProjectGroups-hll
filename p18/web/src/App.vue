<template>
  <el-container class="layout-container">
    <el-header class="header">
      <div class="logo">
        <el-icon :size="30" color="#409EFF"><DataAnalysis /></el-icon>
        <span class="title">步态分析医生平台</span>
      </div>
      <div class="user-info">
        <el-avatar :size="32" icon="UserFilled" />
        <span class="username">医生：张医生</span>
      </div>
    </el-header>
    
    <el-container>
      <el-aside width="200px" class="sidebar">
        <el-menu
          :default-active="$route.path"
          class="menu"
          router
        >
          <el-menu-item index="/">
            <el-icon><DataLine /></el-icon>
            <span>概览</span>
          </el-menu-item>
          <el-menu-item index="/patients">
            <el-icon><User /></el-icon>
            <span>患者管理</span>
          </el-menu-item>
          <el-menu-item index="/reports">
            <el-icon><Document /></el-icon>
            <span>报告列表</span>
          </el-menu-item>
          <el-menu-item index="/analytics">
            <el-icon><TrendCharts /></el-icon>
            <span>数据分析</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref } from 'vue'
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.header {
  background: linear-gradient(90deg, #409EFF 0%, #67C23A 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  color: white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-size: 20px;
  font-weight: 600;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.username {
  font-size: 14px;
}

.sidebar {
  background-color: #f5f7fa;
  border-right: 1px solid #e4e7ed;
}

.menu {
  border: none;
}

.main-content {
  background-color: #f0f2f5;
  padding: 24px;
}
</style>
