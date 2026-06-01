<template>
  <div class="dashboard">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon icon-pool">
            <el-icon :size="32"><FolderOpened /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.pools }}</div>
            <div class="stat-label">存储池数量</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon icon-image">
            <el-icon :size="32"><HardDrive /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.images }}</div>
            <div class="stat-label">镜像数量</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon icon-snapshot">
            <el-icon :size="32"><Camera /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.snapshots }}</div>
            <div class="stat-label">快照数量</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon icon-clone">
            <el-icon :size="32"><CopyDocument /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.clones }}</div>
            <div class="stat-label">克隆数量</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>存储池列表</span>
            </div>
          </template>
          <el-table :data="pools" v-loading="loading" style="width: 100%">
            <el-table-column prop="name" label="存储池名称" />
            <el-table-column label="镜像数量">
              <template #default="scope">{{ scope.row.images?.length || 0 }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="scope">
                <el-button type="primary" link @click="viewPoolImages(scope.row)">
                  查看镜像
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>最近操作</span>
            </div>
          </template>
          <el-table :data="operations" style="width: 100%">
            <el-table-column prop="time" label="时间" width="180" />
            <el-table-column prop="type" label="操作类型" />
            <el-table-column prop="target" label="操作对象" />
            <el-table-column prop="status" label="状态">
              <template #default="scope">
                <el-tag :type="scope.row.status === '成功' ? 'success' : 'danger'" size="small">
                  {{ scope.row.status }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row style="margin-top: 20px">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>快速操作</span>
            </div>
          </template>
          <div class="quick-actions">
            <el-button type="primary" :icon="Plus" @click="goToCreateImage">
              创建镜像
            </el-button>
            <el-button type="success" :icon="Camera" @click="goToSnapshotTree">
              查看快照树
            </el-button>
            <el-button type="warning" :icon="Link" @click="goToCloneChain">
              查看克隆链
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { FolderOpened, HardDrive, Camera, CopyDocument, Plus, Link } from '@element-plus/icons-vue'
import { poolApi, treeApi } from '../api'

const router = useRouter()
const loading = ref(false)
const pools = ref([])
const stats = ref({
  pools: 0,
  images: 0,
  snapshots: 0,
  clones: 0
})
const operations = ref([
  { time: '2024-01-15 10:30:00', type: '创建镜像', target: 'image-001', status: '成功' },
  { time: '2024-01-15 10:35:00', type: '创建快照', target: 'image-001@snap1', status: '成功' },
  { time: '2024-01-15 10:40:00', type: '创建克隆', target: 'clone-001', status: '成功' },
  { time: '2024-01-15 10:45:00', type: '删除快照', target: 'image-001@snap2', status: '成功' },
])

const countTreeNodes = (nodes) => {
  let snapshotCount = 0
  let cloneCount = 0
  for (const node of nodes) {
    if (node.type === 'snapshot') snapshotCount++
    if (node.type === 'clone') cloneCount++
    if (node.children && node.children.length > 0) {
      const counts = countTreeNodes(node.children)
      snapshotCount += counts.snapshots
      cloneCount += counts.clones
    }
  }
  return { snapshots: snapshotCount, clones: cloneCount }
}

const loadData = async () => {
  loading.value = true
  try {
    pools.value = await poolApi.listWithImages()
    stats.value.pools = pools.value.length
    stats.value.images = pools.value.reduce((sum, p) => sum + (p.images?.length || 0), 0)

    try {
      const treeData = await treeApi.getCompleteTree()
      const counts = countTreeNodes(treeData)
      stats.value.snapshots = counts.snapshots
      stats.value.clones = counts.clones
    } catch (e) {
      console.warn('Failed to load tree data:', e)
    }
  } catch (error) {
    ElMessage.error('加载数据失败: ' + error)
  } finally {
    loading.value = false
  }
}

const viewPoolImages = (pool) => {
  router.push({ path: '/images', query: { pool: pool.name } })
}

const goToCreateImage = () => {
  router.push('/images')
}

const goToSnapshotTree = () => {
  router.push('/snapshot-tree')
}

const goToCloneChain = () => {
  router.push('/clone-chain')
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.dashboard {
  width: 100%;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 20px;
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-right: 16px;
}

.icon-pool {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.icon-image {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.icon-snapshot {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.icon-clone {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #333;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

.card-header {
  font-weight: 600;
}

.quick-actions {
  display: flex;
  gap: 12px;
}
</style>
