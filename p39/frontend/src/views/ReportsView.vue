<template>
  <div class="page-container">
    <h2 class="page-title">报表管理</h2>

    <el-row :gutter="20">
      <el-col :span="24">
        <el-card class="card-shadow mb-24">
          <template #header>
            <span>数据概览</span>
          </template>
          <div class="time-range-selector">
            <span class="label">时间范围：</span>
            <el-date-picker
              v-model="dateRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始时间"
              end-placeholder="结束时间"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DDTHH:mm:ss"
              style="width: 400px;"
            />
            <el-button type="primary" @click="loadSummary" :loading="loading">
              <el-icon><Search /></el-icon>
              查询
            </el-button>
          </div>

          <el-row :gutter="20" class="summary-row">
            <el-col :span="6">
              <div class="summary-card">
                <div class="summary-icon probe">
                  <el-icon><Connection /></el-icon>
                </div>
                <div class="summary-content">
                  <div class="summary-value">{{ summary?.total_probe_records || 0 }}</div>
                  <div class="summary-label">探针记录数</div>
                </div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="summary-card">
                <div class="summary-icon device">
                  <el-icon><Monitor /></el-icon>
                </div>
                <div class="summary-content">
                  <div class="summary-value">{{ summary?.unique_devices || 0 }}</div>
                  <div class="summary-label">独立设备数</div>
                </div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="summary-card">
                <div class="summary-icon passenger">
                  <el-icon><User /></el-icon>
                </div>
                <div class="summary-content">
                  <div class="summary-value">{{ summary?.avg_passengers || 0 }}</div>
                  <div class="summary-label">平均客流</div>
                </div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="summary-card">
                <div class="summary-icon peak">
                  <el-icon><TrendCharts /></el-icon>
                </div>
                <div class="summary-content">
                  <div class="summary-value">{{ summary?.max_passengers || 0 }}</div>
                  <div class="summary-label">峰值客流</div>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="24">
        <el-card class="card-shadow">
          <template #header>
            <span>数据导出</span>
          </template>

          <el-tabs v-model="activeTab">
            <el-tab-pane label="客流数据" name="passenger">
              <div class="export-config">
                <el-form :inline="true">
                  <el-form-item label="区域">
                    <el-select v-model="exportZone" placeholder="全部区域" clearable style="width: 150px;">
                      <el-option v-for="zone in summary?.zones || []" :key="zone" :label="zone" :value="zone" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="时间范围">
                    <el-date-picker
                      v-model="exportDateRange"
                      type="datetimerange"
                      range-separator="至"
                      start-placeholder="开始时间"
                      end-placeholder="结束时间"
                      format="YYYY-MM-DD HH:mm"
                      value-format="YYYY-MM-DDTHH:mm:ss"
                      style="width: 400px;"
                    />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane label="小时统计" name="hourly">
              <div class="export-config">
                <el-form :inline="true">
                  <el-form-item label="区域">
                    <el-select v-model="exportZone" placeholder="全部区域" clearable style="width: 150px;">
                      <el-option v-for="zone in summary?.zones || []" :key="zone" :label="zone" :value="zone" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="时间范围">
                    <el-date-picker
                      v-model="exportDateRange"
                      type="datetimerange"
                      range-separator="至"
                      start-placeholder="开始时间"
                      end-placeholder="结束时间"
                      format="YYYY-MM-DD HH:mm"
                      value-format="YYYY-MM-DDTHH:mm:ss"
                      style="width: 400px;"
                    />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <el-tab-pane label="探针原始数据" name="probe">
              <div class="export-config">
                <el-alert
                  title="提示"
                  type="info"
                  description="探针数据量较大，建议缩小时间范围导出"
                  show-icon
                  :closable="false"
                  style="margin-bottom: 16px;"
                />
                <el-form :inline="true">
                  <el-form-item label="区域">
                    <el-select v-model="exportZone" placeholder="全部区域" clearable style="width: 150px;">
                      <el-option v-for="zone in summary?.zones || []" :key="zone" :label="zone" :value="zone" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="时间范围">
                    <el-date-picker
                      v-model="exportDateRange"
                      type="datetimerange"
                      range-separator="至"
                      start-placeholder="开始时间"
                      end-placeholder="结束时间"
                      format="YYYY-MM-DD HH:mm"
                      value-format="YYYY-MM-DDTHH:mm:ss"
                      style="width: 400px;"
                    />
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>
          </el-tabs>

          <div class="export-actions">
            <el-button type="success" @click="handleExport" :loading="exporting">
              <el-icon><Download /></el-icon>
              导出 CSV
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mt-24">
      <el-col :span="24">
        <el-card class="card-shadow">
          <template #header>
            <div class="flex-between">
              <span>每日统计报表</span>
              <el-date-picker
                v-model="reportDate"
                type="date"
                placeholder="选择日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                style="width: 150px;"
                @change="loadDailyReport"
              />
            </div>
          </template>

          <div v-if="dailyReport" class="daily-report">
            <div class="report-header">
              <h3>{{ dailyReport.date }} 客流统计报告</h3>
              <el-tag type="info">生成时间: {{ formatTime(dailyReport.generated_at) }}</el-tag>
            </div>

            <el-row :gutter="20">
              <el-col :span="6">
                <div class="report-stat">
                  <div class="stat-label">总记录数</div>
                  <div class="stat-value">{{ dailyReport.total_records }}</div>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="report-stat">
                  <div class="stat-label">整体平均</div>
                  <div class="stat-value">{{ dailyReport.overall_avg }}</div>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="report-stat">
                  <div class="stat-label">整体最高</div>
                  <div class="stat-value">{{ dailyReport.overall_max }}</div>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="report-stat">
                  <div class="stat-label">整体最低</div>
                  <div class="stat-value">{{ dailyReport.overall_min }}</div>
                </div>
              </el-col>
            </el-row>

            <el-divider />

            <h4 style="margin-bottom: 16px;">分区域统计</h4>
            <el-table
              :data="getZoneReportList"
              border
              stripe
              style="width: 100%;"
            >
              <el-table-column prop="zone" label="区域" width="150" />
              <el-table-column prop="avg_count" label="平均人数" width="120" sortable />
              <el-table-column prop="max_count" label="最高人数" width="120" sortable />
              <el-table-column prop="min_count" label="最低人数" width="120" sortable />
              <el-table-column prop="peak_hour" label="峰值小时" width="120">
                <template #default="{ row }">
                  {{ row.peak_hour }}:00
                </template>
              </el-table-column>
              <el-table-column prop="peak_count" label="峰值人数" width="120" />
              <el-table-column prop="total_samples" label="样本数" width="120" />
            </el-table>
          </div>

          <el-empty v-else description="暂无数据" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getReportSummary, getDailyReport, exportCSV } from '@/api'

const loading = ref(false)
const exporting = ref(false)
const activeTab = ref('passenger')
const summary = ref(null)
const dailyReport = ref(null)

const dateRange = ref([])
const reportDate = ref(new Date().toISOString().split('T')[0])
const exportZone = ref('')
const exportDateRange = ref([])

const getZoneReportList = computed(() => {
  if (!dailyReport.value?.zone_reports) return []
  return Object.entries(dailyReport.value.zone_reports).map(([zone, data]) => ({
    zone,
    ...data
  }))
})

const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString('zh-CN')
}

const loadSummary = async () => {
  if (loading.value) return
  loading.value = true
  try {
    const params = {}
    if (dateRange.value?.length === 2) {
      params.start_time = dateRange.value[0]
      params.end_time = dateRange.value[1]
    }
    const res = await getReportSummary(params)
    summary.value = res.data
  } catch (e) {
    ElMessage.error('加载统计数据失败')
    console.error(e)
  } finally {
    loading.value = false
  }
}

const loadDailyReport = async () => {
  try {
    const res = await getDailyReport(reportDate.value)
    dailyReport.value = res.data
  } catch (e) {
    ElMessage.error('加载日报表失败')
    console.error(e)
  }
}

const handleExport = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    const params = {
      report_type: activeTab.value,
      zone: exportZone.value || undefined
    }
    if (exportDateRange.value?.length === 2) {
      params.start_time = exportDateRange.value[0]
      params.end_time = exportDateRange.value[1]
    }

    const res = await exportCSV(params)
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeTab.value}_report_${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    ElMessage.success('导出成功')
  } catch (e) {
    ElMessage.error('导出失败')
    console.error(e)
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  loadSummary()
  loadDailyReport()
})
</script>

<style lang="scss" scoped>
.time-range-selector {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;

  .label {
    color: #606266;
  }
}

.summary-row {
  margin-top: 24px;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;

  .summary-icon {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    color: white;

    &.probe { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    &.device { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
    &.passenger { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    &.peak { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
  }

  .summary-content {
    .summary-value {
      font-size: 28px;
      font-weight: 700;
      color: #303133;
      line-height: 1.2;
    }
    .summary-label {
      font-size: 13px;
      color: #909399;
      margin-top: 4px;
    }
  }
}

.export-config {
  padding: 16px 0;
}

.export-actions {
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.daily-report {
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;

    h3 {
      margin: 0;
      font-size: 18px;
      color: #303133;
    }
  }

  .report-stat {
    text-align: center;
    padding: 16px;
    background: #f5f7fa;
    border-radius: 8px;

    .stat-label {
      color: #909399;
      font-size: 13px;
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #667eea;
    }
  }
}

.mt-24 {
  margin-top: 24px;
}
</style>
