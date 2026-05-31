<template>
  <div class="produce-detail">
    <el-page-header @back="$router.back()" content="农产品详情" />
    
    <el-card style="margin-top: 20px;" v-loading="loading">
      <template #header>
        <div class="card-header">
          <span>基本信息</span>
          <el-button type="primary" @click="generateQR">
            <el-icon><QrCode /></el-icon>
            生成溯源码
          </el-button>
        </div>
      </template>
      
      <el-descriptions :column="2" border>
        <el-descriptions-item label="产品ID">{{ produce.id }}</el-descriptions-item>
        <el-descriptions-item label="产品名称">{{ produce.name }}</el-descriptions-item>
        <el-descriptions-item label="批次号">{{ produce.batchNumber }}</el-descriptions-item>
        <el-descriptions-item label="数量">{{ produce.quantity }} {{ produce.unit }}</el-descriptions-item>
        <el-descriptions-item label="当前持有方">{{ produce.currentOwner }}</el-descriptions-item>
        <el-descriptions-item label="角色">
          <el-tag :type="getRoleTagType(produce.ownerRole)">
            {{ getRoleName(produce.ownerRole) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusTagType(produce.status)">
            {{ getStatusName(produce.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatDate(produce.timestamp) }}</el-descriptions-item>
      </el-descriptions>
      
      <div v-if="priceData" class="price-section" style="margin-top: 20px;">
        <el-alert
          title="私有价格数据"
          type="info"
          :description="`价格: ${priceData.price} ${priceData.currency} (${priceData.ownerOrg})`"
          show-icon
          closable
        />
      </div>
      
      <div v-if="produce.imageURL" class="image-section">
        <h4>产品图片</h4>
        <img :src="produce.imageURL" alt="产品图片" class="produce-image" />
      </div>
    </el-card>

    <el-card style="margin-top: 20px;">
      <template #header>
        <span>流转记录</span>
      </template>
      <el-steps direction="vertical" :active="history.transfers.length" finish-status="success">
        <el-step v-for="(transfer, index) in history.transfers" :key="index">
          <template #title>
            {{ getRoleName(transfer.toRole) }}: {{ transfer.to }}
          </template>
          <template #description>
            <div>来自: {{ transfer.fromRole }} - {{ transfer.from }}</div>
            <div>地点: {{ transfer.location }}</div>
            <div>时间: {{ formatDate(transfer.timestamp) }}</div>
            <div v-if="transfer.remark">备注: {{ transfer.remark }}</div>
          </template>
        </el-step>
      </el-steps>
    </el-card>

    <el-card style="margin-top: 20px;">
      <template #header>
        <span>检测报告</span>
      </template>
      <el-table :data="history.reports" style="width: 100%" v-if="history.reports.length > 0">
        <el-table-column prop="id" label="报告ID" />
        <el-table-column prop="inspector" label="质检员" />
        <el-table-column prop="inspectionDate" label="检测日期">
          <template #default="{ row }">{{ formatDate(row.inspectionDate) }}</template>
        </el-table-column>
        <el-table-column prop="conclusion" label="结论">
          <template #default="{ row }">
            <el-tag :type="row.conclusion === '合格' ? 'success' : 'danger'">
              {{ row.conclusion }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="详情">
          <template #default="{ row }">
            <el-button type="primary" link @click="viewReport(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty description="暂无检测报告" v-else />
    </el-card>

    <el-dialog v-model="qrDialogVisible" title="溯源二维码" width="400">
      <div class="qr-content">
        <img :src="qrCode" alt="二维码" class="qr-image" />
        <p class="qr-text">扫描二维码查看溯源信息</p>
        <el-button type="primary" @click="downloadQR">下载二维码</el-button>
        <el-button type="success" @click="downloadCertificate" style="margin-left: 10px;">
          <el-icon><Download /></el-icon>
          下载PDF证书
        </el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="reportDialogVisible" title="检测报告详情" width="600">
      <div v-if="currentReport">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="报告ID">{{ currentReport.id }}</el-descriptions-item>
          <el-descriptions-item label="质检员">{{ currentReport.inspector }}</el-descriptions-item>
          <el-descriptions-item label="检测日期" :span="2">
            {{ formatDate(currentReport.inspectionDate) }}
          </el-descriptions-item>
        </el-descriptions>
        <h4 style="margin: 20px 0 10px;">检测项目</h4>
        <el-table :data="getReportItems()" style="width: 100%">
          <el-table-column prop="item" label="检测项目" />
          <el-table-column prop="result" label="检测结果" />
        </el-table>
        <h4 style="margin: 20px 0 10px;">结论</h4>
        <el-tag :type="currentReport.conclusion === '合格' ? 'success' : 'danger'" size="large">
          {{ currentReport.conclusion }}
        </el-tag>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../api'

const route = useRoute()
const produceId = route.params.id

const loading = ref(false)
const produce = ref({})
const history = ref({ transfers: [], reports: [] })
const priceData = ref(null)
const qrDialogVisible = ref(false)
const qrCode = ref('')
const reportDialogVisible = ref(false)
const currentReport = ref(null)

function getRoleName(role) {
  const names = { farm: '农场', factory: '加工厂', logistics: '物流' }
  return names[role] || role
}

function getRoleTagType(role) {
  const types = { farm: 'success', factory: 'warning', logistics: 'info' }
  return types[role] || ''
}

function getStatusName(status) {
  const names = { CREATED: '已创建', TRANSFERRED: '流转中', DELIVERED: '已送达' }
  return names[status] || status
}

function getStatusTagType(status) {
  const types = { CREATED: 'primary', TRANSFERRED: 'warning', DELIVERED: 'success' }
  return types[status] || ''
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

function getReportItems() {
  if (!currentReport.value) return []
  return currentReport.value.items.map((item, index) => ({
    item,
    result: currentReport.value.results[index]
  }))
}

async function loadData() {
  loading.value = true
  try {
    const [produceRes, historyRes] = await Promise.all([
      api.get(`/produce/${produceId}`),
      api.get(`/produce/${produceId}/history`)
    ])
    produce.value = produceRes.data
    history.value = historyRes.data
    
    try {
      const priceRes = await api.get(`/price/${produceId}`)
      priceData.value = priceRes.data
    } catch (error) {
      console.log('无价格数据或无权限')
    }
  } catch (error) {
    ElMessage.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

async function generateQR() {
  try {
    const response = await api.get(`/qr/generate/${produceId}`)
    qrCode.value = response.data.qrCode
    qrDialogVisible.value = true
  } catch (error) {
    ElMessage.error('生成二维码失败')
  }
}

function downloadQR() {
  const link = document.createElement('a')
  link.href = qrCode.value
  link.download = `qrcode-${produceId}.png`
  link.click()
}

function downloadCertificate() {
  window.open(`/api/certificate/${produceId}`, '_blank')
  ElMessage.success('证书下载已开始')
}

function viewReport(report) {
  currentReport.value = report
  reportDialogVisible.value = true
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.image-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;
}

.produce-image {
  max-width: 300px;
  max-height: 300px;
  border-radius: 4px;
}

.qr-content {
  text-align: center;
}

.qr-image {
  width: 200px;
  height: 200px;
  margin: 20px 0;
}

.qr-text {
  color: #606266;
  margin-bottom: 20px;
}
</style>
