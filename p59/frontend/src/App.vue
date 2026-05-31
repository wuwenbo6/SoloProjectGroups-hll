<template>
  <div id="app">
    <el-container style="height: 100vh">
      <el-header style="background: #409EFF; color: white; display: flex; align-items: center; padding: 0 20px;">
        <h2 style="margin: 0">💊 智能药盒管理系统</h2>
      </el-header>
      <el-container>
        <el-aside width="200px" style="background: #f5f7fa; border-right: 1px solid #e6e6e6;">
          <el-menu
            :default-active="activeMenu"
            router
            style="border-right: none"
          >
            <el-menu-item index="/">
              <el-icon><DataLine /></el-icon>
              <span>概览</span>
            </el-menu-item>
            <el-menu-item index="/users">
              <el-icon><User /></el-icon>
              <span>用户管理</span>
            </el-menu-item>
            <el-menu-item index="/pillboxes">
              <el-icon><Box /></el-icon>
              <span>药盒管理</span>
            </el-menu-item>
            <el-menu-item index="/plans">
              <el-icon><Calendar /></el-icon>
              <span>用药计划</span>
            </el-menu-item>
            <el-menu-item index="/records">
              <el-icon><List /></el-icon>
              <span>服药记录</span>
            </el-menu-item>
            <el-menu-item index="/reports">
              <el-icon><Document /></el-icon>
              <span>报告导出</span>
            </el-menu-item>
          </el-menu>
        </el-aside>
        <el-main style="background: #fff; overflow: auto;">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activeMenu = computed(() => route.path)
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
}

#app {
  height: 100%;
}
</style>
