<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <div class="header-content">
        <h1 class="title">
          <el-icon><DataLine /></el-icon>
          客流热力图监控系统
        </h1>
        <div class="header-actions">
          <el-tag :type="connectionStatus ? 'success' : 'danger'" size="large">
            {{ connectionStatus ? '已连接' : '未连接' }}
          </el-tag>
          <el-text class="current-time">{{ currentTime }}</el-text>
        </div>
      </div>
    </el-header>
    <el-container>
      <el-aside width="240px" class="app-aside">
        <el-menu
          :default-active="$route.path"
          class="side-menu"
          router
        >
          <el-menu-item index="/">
            <el-icon><Monitor /></el-icon>
            <span>实时监控</span>
          </el-menu-item>
          <el-menu-item index="/heatmap">
            <el-icon><Location /></el-icon>
            <span>热力图</span>
          </el-menu-item>
          <el-menu-item index="/trend">
            <el-icon><TrendCharts /></el-icon>
            <span>趋势预测</span>
          </el-menu-item>
          <el-menu-item index="/history">
            <el-icon><Clock /></el-icon>
            <span>历史回放</span>
          </el-menu-item>
          <el-menu-item index="/zones">
            <el-icon><Setting /></el-icon>
            <span>区域配置</span>
          </el-menu-item>
          <el-menu-item index="/trains">
            <el-icon><Van /></el-icon>
            <span>车次联动</span>
          </el-menu-item>
          <el-menu-item index="/reports">
            <el-icon><Document /></el-icon>
            <span>报表导出</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const connectionStatus = ref(true)
const currentTime = ref('')
let timeInterval = null

const updateTime = () => {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN')
}

onMounted(() => {
  updateTime()
  timeInterval = setInterval(updateTime, 1000)
})

onUnmounted(() => {
  if (timeInterval) {
    clearInterval(timeInterval)
  }
})
</script>

<style lang="scss" scoped>
.app-container {
  height: 100vh;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0;

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 100%;
    padding: 0 24px;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 22px;
    font-weight: 600;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .current-time {
    color: white;
    font-size: 14px;
  }
}

.app-aside {
  background: #f5f7fa;
  border-right: 1px solid #e4e7ed;
}

.side-menu {
  height: 100%;
  border-right: none;
}

.app-main {
  background: #f0f2f5;
  padding: 24px;
  overflow-y: auto;
}
</style>
