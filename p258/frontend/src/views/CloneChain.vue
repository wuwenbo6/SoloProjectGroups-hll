<template>
  <div class="clone-chain">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-select v-model="selectedPool" placeholder="选择存储池" style="width: 200px; margin-right: 12px" @change="loadImages">
              <el-option
                v-for="pool in pools"
                :key="pool"
                :label="pool"
                :value="pool"
              />
            </el-select>
            <el-select v-model="selectedImage" placeholder="选择镜像" style="width: 250px; margin-right: 12px" @change="loadTree">
              <el-option
                v-for="image in images"
                :key="image"
                :label="image"
                :value="image"
              />
            </el-select>
            <el-checkbox v-model="showAll" @change="toggleShowAll">
              显示所有克隆链
            </el-checkbox>
          </div>
          <div class="header-right">
            <el-tag type="info" style="margin-right: 8px">
              原始镜像: <b>{{ imageStats.original }}</b>
            </el-tag>
            <el-tag type="success" style="margin-right: 8px">
              快照: <b>{{ imageStats.snapshots }}</b>
            </el-tag>
            <el-tag type="warning" style="margin-right: 8px">
              克隆: <b>{{ imageStats.clones }}</b>
            </el-tag>
            <el-dropdown @command="exportTopology" style="margin-left: 8px">
              <el-button type="primary" :icon="Download">
                导出拓扑
                <el-icon><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="json">导出为 JSON</el-dropdown-item>
                  <el-dropdown-item command="dot">导出为 DOT</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button type="danger" :icon="Warning" @click="checkDepthWarnings" style="margin-left: 8px">
              检查深度 ({{ depthWarnings.length }})
            </el-button>
            <el-button type="primary" :icon="MagicStick" @click="autoFlattenDeepClones" v-if="depthWarnings.length > 0">
              一键展平深层
            </el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="depthWarnings.length > 0"
        type="error"
        :closable="false"
        style="margin-bottom: 20px"
      >
        <template #title>
          ⚠️ 发现 {{ depthWarnings.length }} 个克隆链超过推荐深度（5层）
        </template>
        <template #default>
          深层克隆链会影响性能并增加管理复杂度。建议展平深层克隆以优化存储效率。
        </template>
      </el-alert>

      <el-alert
        v-if="!hasData && depthWarnings.length === 0"
        title="暂无克隆链数据"
        type="info"
        :closable="false"
        style="margin-bottom: 20px"
      >
        <template #default>
          该存储池中暂无镜像或克隆关系。请先创建镜像、快照，然后从快照创建克隆。
        </template>
      </el-alert>

      <div class="chain-wrapper">
        <CloneChainVisualization
          v-if="hasData"
          :chain-data="treeData"
          @node-click="handleNodeClick"
        />
      </div>
    </el-card>

    <el-drawer v-model="detailVisible" title="节点详情" size="420px">
      <el-descriptions :column="1" border v-if="currentNode">
        <el-descriptions-item label="名称">
          {{ currentNode.name }}
        </el-descriptions-item>
        <el-descriptions-item label="类型">
          <el-tag :type="nodeTypeTag(currentNode.type)">
            {{ typeLabel(currentNode.type) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="大小" v-if="currentNode.size">
          {{ formatSize(currentNode.size) }}
        </el-descriptions-item>
        <el-descriptions-item label="克隆深度" v-if="currentNode.depth !== undefined">
          <el-tag :type="currentNode.depth >= 5 ? 'danger' : currentNode.depth >= 3 ? 'warning' : 'info'">
            {{ currentNode.depth }} 层
          </el-tag>
          <el-tag v-if="currentNode.depth >= 5" type="danger" style="margin-left: 8px">
            建议展平
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="深度警告" v-if="currentNode.has_warning">
          <el-tag type="danger">存在深度警告</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间" v-if="currentNode.timestamp">
          {{ currentNode.timestamp }}
        </el-descriptions-item>
        <el-descriptions-item label="保护状态" v-if="currentNode.is_protected !== undefined">
          <el-tag :type="currentNode.is_protected ? 'success' : 'info'">
            {{ currentNode.is_protected ? '已保护' : '未保护' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="父镜像" v-if="currentNode.parent_info">
          {{ currentNode.parent_info.image }}@{{ currentNode.parent_info.snapshot }}
        </el-descriptions-item>
      </el-descriptions>

      <div style="margin-top: 20px" v-if="currentNode?.type === 'clone'">
        <el-button type="warning" @click="flattenCurrentClone">
          展平克隆
        </el-button>
        <el-alert
          v-if="currentNode?.depth >= 5"
          type="warning"
          :closable="false"
          style="margin-top: 16px"
        >
          <template #title>
            深度警告
          </template>
          <template #default>
            此克隆处于第 {{ currentNode.depth }} 层，建议展平以优化性能和简化依赖链。
          </template>
        </el-alert>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import CloneChainVisualization from '../components/CloneChainVisualization.vue'
import { poolApi, imageApi, treeApi, cloneApi, warningApi } from '../api'
import { Warning, MagicStick, Download, ArrowDown } from '@element-plus/icons-vue'

const pools = ref([])
const selectedPool = ref('')
const images = ref([])
const selectedImage = ref('')
const showAll = ref(true)
const treeData = ref([])
const loading = ref(false)
const depthWarnings = ref([])

const detailVisible = ref(false)
const currentNode = ref(null)

const hasData = computed(() => treeData.value && treeData.value.length > 0)

const imageStats = computed(() => {
  let original = 0
  let snapshots = 0
  let clones = 0

  const count = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'image') original++
      else if (node.type === 'snapshot') snapshots++
      else if (node.type === 'clone') clones++
      if (node.children) count(node.children)
    }
  }

  count(treeData.value)
  return { original, snapshots, clones }
})

const typeLabel = (type) => {
  const labels = {
    image: '原始镜像',
    snapshot: '快照',
    clone: '克隆'
  }
  return labels[type] || type
}

const nodeTypeTag = (type) => {
  const tags = {
    image: '',
    snapshot: 'success',
    clone: 'warning'
  }
  return tags[type] || ''
}

const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return size.toFixed(2) + ' ' + units[unitIndex]
}

const loadPools = async () => {
  try {
    pools.value = await poolApi.list()
    if (pools.value.length > 0) {
      selectedPool.value = pools.value[0]
      loadImages()
    }
  } catch (error) {
    ElMessage.error('加载存储池失败: ' + error)
  }
}

const loadImages = async () => {
  if (!selectedPool.value) return
  try {
    images.value = await imageApi.list(selectedPool.value)
    if (showAll.value) {
      loadTree()
    }
  } catch (error) {
    ElMessage.error('加载镜像列表失败: ' + error)
  }
}

const loadTree = async () => {
  if (!selectedImage.value && !showAll.value) {
    treeData.value = []
    return
  }
  loading.value = true
  try {
    if (showAll.value) {
      treeData.value = await treeApi.getCompleteTree()
    } else {
      const singleTree = await treeApi.getSnapshotTree(selectedImage.value, selectedPool.value)
      treeData.value = [singleTree]
    }
  } catch (error) {
    ElMessage.error('加载克隆链失败: ' + error)
    treeData.value = []
  } finally {
    loading.value = false
  }
}

const toggleShowAll = () => {
  if (showAll.value) {
    selectedImage.value = ''
  }
  loadTree()
}

const handleNodeClick = (node) => {
  currentNode.value = node
  detailVisible.value = true
}

const flattenCurrentClone = async () => {
  if (!currentNode.value) return
  try {
    await ElMessageBox.confirm(
      `确定要展平克隆镜像 ${currentNode.value.name} 吗？展平后将与父镜像断开关联，解决依赖链问题。`,
      '展平确认',
      { type: 'warning' }
    )
    await cloneApi.flatten({
      image_name: currentNode.value.name,
      pool: selectedPool.value
    })
    ElMessage.success('克隆展平成功')
    detailVisible.value = false
    loadTree()
    checkDepthWarnings()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('展平失败: ' + error)
    }
  }
}

const checkDepthWarnings = async () => {
  try {
    depthWarnings.value = await warningApi.getDepthWarnings()
    if (depthWarnings.value.length === 0) {
      ElMessage.success('所有克隆链深度正常（≤5层）')
    }
  } catch (error) {
    ElMessage.error('检查深度警告失败: ' + error)
  }
}

const autoFlattenDeepClones = async () => {
  if (depthWarnings.value.length === 0) return
  try {
    await ElMessageBox.confirm(
      `确定要一键展平所有 ${depthWarnings.value.length} 个深层克隆（深度≥5层）吗？\n\n这将自动解决所有深度警告问题，可能需要一些时间。`,
      '一键展平确认',
      { type: 'warning' }
    )
    const result = await cloneApi.flattenDeep(selectedPool.value, 5)
    ElMessage.success(`展平完成: 成功 ${result.success.length} 个, 失败 ${result.failed.length} 个`)
    loadTree()
    checkDepthWarnings()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('一键展平失败: ' + error)
    }
  }
}

const exportTopology = async (format) => {
  try {
    const result = await treeApi.exportTopology(format)
    const blob = new Blob([format === 'json' ? JSON.stringify(result.content, null, 2) : result.content], {
      type: format === 'json' ? 'application/json' : 'text/plain'
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename
    link.click()
    URL.revokeObjectURL(url)
    ElMessage.success(`拓扑图已导出为 ${format.toUpperCase()} 格式`)
  } catch (error) {
    ElMessage.error('导出失败: ' + error)
  }
}

onMounted(() => {
  loadPools()
})
</script>

<style scoped>
.clone-chain {
  width: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
}

.chain-wrapper {
  height: calc(100vh - 280px);
  min-height: 500px;
}
</style>
