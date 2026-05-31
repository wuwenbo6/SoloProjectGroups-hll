<template>
  <div class="trace-page">
    <div class="trace-header">
      <h1>农产品溯源信息</h1>
      <p>Produce Traceability Information</p>
    </div>
    
    <el-card v-loading="loading" class="trace-card">
      <template v-if="traceData">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="产品ID">{{ traceData.produce.id }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ traceData.produce.name }}</el-descriptions-item>
          <el-descriptions-item label="批次号">{{ traceData.produce.batchNumber }}</el-descriptions-item>
          <el-descriptions-item label="数量">{{ traceData.produce.quantity }} {{ traceData.produce.unit }}</el-descriptions-item>
          <el-descriptions-item label="当前持有方">{{ traceData.produce.currentOwner }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="traceData.produce.status === 'CREATED' ? 'primary' : 'warning'">
              {{ traceData.produce.status === 'CREATED' ? '已创建' : '流转中' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDate(traceData.produce.timestamp) }}</el-descriptions-item>
        </el-descriptions>
        
        <div v-if="traceData.produce.imageURL" class="image-section">
          <h4>产品图片</h4>
          <img :src="`http://localhost:3000${traceData.produce.imageURL}`" alt="产品图片" class="produce-image" />
        </div>
        
        <h3 class="section-title">流转记录</h3>
        <el-timeline>
          <el-timeline-item
            v-for="(transfer, index) in traceData.transfers"
            :key="index"
            :timestamp="formatDate(transfer.timestamp)"
            placement="top"
          >
            <el-card>
              <h4>{{ getRoleName(transfer.toRole) }}: {{ transfer.to }}</h4>
              <p>来自: {{ getRoleName(transfer.fromRole) }} - {{ transfer.from }}</p>
              <p>地点: {{ transfer.location }}</p>
              <p v-if="transfer.remark">备注: {{ transfer.remark }}</p>
            </el-card>
          </el-timeline-item>
        </el-timeline>
        
        <h3 class="section-title" v-if="traceData.reports.length > 0">检测报告</h3>
        <el-table :data="traceData.reports" style="width: 100%" v-if="traceData.reports.length > 0">
          <el-table-column prop="id" label="报告编号" />
          <el-table-column prop="inspector" label="质检员" />
          <el-table-column prop="conclusion" label="结论">
            <template #default="{ row }">
              <el-tag :type="row.conclusion === '合格' ? 'success' : 'danger'">
                {{ row.conclusion }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="inspectionDate" label="检测日期">
            <template #default="{ row }">{{ formatDate(row.inspectionDate) }}</template>
          </el-table-column>
        </el-table>
      </template>
      
      <el-empty v-else description="未找到溯源信息" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '../api'

const route = useRoute()
const produceId = route.params.id

const loading = ref(true)
const traceData = ref(null)

function getRoleName(role) {
  const names = { farm: '农场', factory: '加工厂', logistics: '物流' }
  return names[role] || role
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

async function loadTraceData() {
  loading.value = true
  try {
    const response = await api.get(`/produce/${produceId}/history`)
    traceData.value = response.data
  } catch (error) {
    console.error('加载溯源信息失败:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadTraceData()
})
</script>

<style scoped>
.trace-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
}

.trace-header {
  text-align: center;
  margin-bottom: 30px;
  color: white;
}

.trace-header h1 {
  margin: 0 0 10px 0;
  font-size: 32px;
}

.trace-header p {
  margin: 0;
  opacity: 0.8;
}

.trace-card {
  max-width: 800px;
  margin: 0 auto;
}

.section-title {
  margin: 30px 0 15px 0;
  color: #303133;
  font-size: 18px;
}

.image-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;
}

.image-section h4 {
  margin: 0 0 10px 0;
  color: #606266;
}

.produce-image {
  max-width: 300px;
  max-height: 300px;
  border-radius: 4px;
}
</style>
