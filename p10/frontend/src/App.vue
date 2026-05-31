<template>
  <el-container class="layout">
    <el-aside width="240px" class="sidebar">
      <div class="logo">
        <el-icon size="32"><Monitor /></el-icon>
        <h2>IoT 管理系统</h2>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="transparent"
        text-color="#fff"
        active-text-color="#409eff"
      >
        <el-menu-item index="/">
          <el-icon><Odometer /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/devices">
          <el-icon><Setting /></el-icon>
          <span>设备管理</span>
        </el-menu-item>
        <el-menu-item index="/rules">
          <el-icon><Connection /></el-icon>
          <span>规则引擎</span>
        </el-menu-item>
        <el-menu-item index="/scenes">
          <el-icon><MagicStick /></el-icon>
          <span>场景联动</span>
        </el-menu-item>
        <el-menu-item index="/diagnostics">
          <el-icon><DataLine /></el-icon>
          <span>诊断中心</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="breadcrumb">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentPage }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
      </el-header>
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activeMenu = computed(() => route.path)

const pageTitles = {
  '/': '仪表盘',
  '/devices': '设备管理',
  '/rules': '规则引擎',
  '/scenes': '场景联动',
  '/diagnostics': '诊断中心'
}

const currentPage = computed(() => pageTitles[route.path] || '仪表盘')
</script>

<style scoped>
.layout {
  height: 100vh;
}
.sidebar {
  background: linear-gradient(180deg, #304156 0%, #1a1f3a 100%);
  color: #fff;
}
.logo {
  display: flex;
  align-items: center;
  padding: 20px;
  gap: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.logo h2 {
  font-size: 18px;
  margin: 0;
  color: #fff;
}
.header {
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
}
.main-content {
  background: #f0f2f5;
  padding: 24px;
}
.el-menu {
  border-right: none;
}
</style>
