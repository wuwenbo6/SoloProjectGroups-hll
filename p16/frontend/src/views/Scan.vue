<template>
  <div class="scan">
    <el-card>
      <template #header>
        <span>扫码溯源</span>
      </template>
      
      <div class="scan-container">
        <div class="scan-section">
          <h3>摄像头扫码</h3>
          <div id="reader" class="reader-container"></div>
          <el-button type="primary" @click="startScanner" :disabled="scanning">
            {{ scanning ? '扫描中...' : '开始扫码' }}
          </el-button>
          <el-button @click="stopScanner" v-if="scanning">停止扫码</el-button>
        </div>
        
        <div class="manual-section">
          <h3>手动输入</h3>
          <el-input 
            v-model="manualId" 
            placeholder="请输入产品ID" 
            style="width: 300px; margin-right: 10px;"
            @keyup.enter="manualTrace"
          />
          <el-button type="primary" @click="manualTrace">查询溯源</el-button>
        </div>
      </div>
    </el-card>

    <el-card v-if="traceData" style="margin-top: 20px;">
      <template #header>
        <span>溯源结果</span>
      </template>
      
      <el-descriptions :column="2" border>
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
      </el-descriptions>
      
      <h4 style="margin: 20px 0 10px;">流转记录</h4>
      <el-steps direction="vertical" :active="traceData.transfers.length" finish-status="success">
        <el-step v-for="(transfer, index) in traceData.transfers" :key="index">
          <template #title>
            {{ getRoleName(transfer.toRole) }}: {{ transfer.to }}
          </template>
          <template #description>
            <div>来自: {{ transfer.from }}</div>
            <div>地点: {{ transfer.location }}</div>
            <div>时间: {{ formatDate(transfer.timestamp) }}</div>
          </template>
        </el-step>
      </el-steps>
      
      <h4 style="margin: 20px 0 10px;" v-if="traceData.reports.length > 0">检测报告</h4>
      <el-table :data="traceData.reports" style="width: 100%" v-if="traceData.reports.length > 0">
        <el-table-column prop="id" label="报告ID" />
        <el-table-column prop="inspector" label="质检员" />
        <el-table-column prop="conclusion" label="结论">
          <template #default="{ row }">
            <el-tag :type="row.conclusion === '合格' ? 'success' : 'danger'">
              {{ row.conclusion }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Html5Qrcode } from 'html5-qrcode'
import api from '../api'

const router = useRouter()
const scanning = ref(false)
const manualId = ref('')
const traceData = ref(null)
let html5QrCode = null

function getRoleName(role) {
  const names = { farm: '农场', factory: '加工厂', logistics: '物流' }
  return names[role] || role
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

function startScanner() {
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode('reader')
  }
  
  scanning.value = true
  
  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      const match = decodedText.match(/trace\/(.+)$/)
      if (match) {
        const produceId = match[1]
        manualId.value = produceId
        getTraceData(produceId)
        stopScanner()
      } else {
        ElMessage.warning('无效的溯源二维码')
      }
    },
    (errorMessage) => {}
  ).catch((err) => {
    console.error('启动扫码失败:', err)
    ElMessage.error('启动摄像头失败，请检查权限')
    scanning.value = false
  })
}

function stopScanner() {
  if (html5QrCode && scanning.value) {
    html5QrCode.stop().then(() => {
      scanning.value = false
    }).catch((err) => {
      console.error('停止扫码失败:', err)
    })
  }
  scanning.value = false
}

async function manualTrace() {
  if (!manualId.value) {
    ElMessage.warning('请输入产品ID')
    return
  }
  await getTraceData(manualId.value)
}

async function getTraceData(id) {
  try {
    const response = await api.get(`/produce/${id}/history`)
    traceData.value = response.data
  } catch (error) {
    ElMessage.error('未找到该产品的溯源信息')
    traceData.value = null
  }
}

onUnmounted(() => {
  stopScanner()
})
</script>

<style scoped>
.scan-container {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.scan-section, .manual-section {
  text-align: center;
}

.reader-container {
  width: 300px;
  height: 300px;
  margin: 0 auto 20px;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
}

h3 {
  margin: 0 0 15px 0;
  color: #303133;
}
</style>
