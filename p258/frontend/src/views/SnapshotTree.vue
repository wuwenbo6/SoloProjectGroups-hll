<template>
  <div class="snapshot-tree">
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
            <el-radio-group v-model="layoutMode" size="small">
              <el-radio-button value="tree">树状</el-radio-button>
              <el-radio-button value="radial">径向</el-radio-button>
            </el-radio-group>
          </div>
          <div class="header-right">
            <el-checkbox v-model="showAll" @change="toggleShowAll">
              显示所有镜像
            </el-checkbox>
            <el-dropdown @command="exportTopology" style="margin-left: 12px">
              <el-button type="primary" :icon="Download">
                导出拓扑图
                <el-icon><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="json">导出为 JSON</el-dropdown-item>
                  <el-dropdown-item command="dot">导出为 DOT (Graphviz)</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button type="danger" :icon="Warning" @click="loadDepthWarnings" style="margin-left: 12px">
              检查深度警告 ({{ depthWarnings.length }})
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
          <span>发现 {{ depthWarnings.length }} 个深度警告！克隆链超过推荐深度（5层）</span>
          <el-button type="danger" link @click="flattenAllWarnings">
            一键展平所有深层克隆
          </el-button>
        </template>
        <template #default>
          <el-table :data="depthWarnings" size="small" style="margin-top: 10px">
            <el-table-column prop="image_name" label="克隆镜像" />
            <el-table-column prop="current_depth" label="当前深度" width="100">
              <template #default="scope">
                <el-tag type="danger">{{ scope.row.current_depth }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="max_recommended_depth" label="最大推荐" width="100" />
            <el-table-column label="克隆链">
              <template #default="scope">
                {{ scope.row.chain_path.join(' → ') }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="scope">
                <el-button type="danger" link size="small" @click="flattenClone(scope.row)">
                  展平
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-alert>

      <el-alert
        v-if="!hasData && depthWarnings.length === 0"
        title="暂无数据"
        type="info"
        :closable="false"
        style="margin-bottom: 20px"
      >
        <template #default>
          请选择一个镜像查看其快照树，或勾选"显示所有镜像"查看完整的快照关系图。
        </template>
      </el-alert>

      <div class="tree-wrapper">
        <TreeVisualization
          v-if="hasData"
          :tree-data="treeData"
          :mode="layoutMode"
          @node-click="handleNodeClick"
        />
      </div>
    </el-card>

    <el-drawer v-model="detailVisible" title="节点详情" size="400px">
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
          <el-tag :type="currentNode.depth >= 5 ? 'danger' : 'info'">
            {{ currentNode.depth }} 层
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
        <el-descriptions-item label="子节点数量">
          {{ currentNode.children?.length || 0 }}
        </el-descriptions-item>
      </el-descriptions>

      <div style="margin-top: 20px">
        <el-button
          v-if="currentNode?.type === 'snapshot'"
          type="primary"
          @click="createCloneFromSnapshot"
        >
          从此快照创建克隆
        </el-button>
        <el-button
          v-if="currentNode?.type === 'snapshot' && !currentNode.is_protected"
          type="success"
          @click="protectCurrentSnapshot"
        >
          保护快照
        </el-button>
        <el-button
          v-if="currentNode?.type === 'snapshot' && currentNode.is_protected"
          type="warning"
          @click="unprotectCurrentSnapshot"
        >
          取消保护
        </el-button>
        <el-button
          v-if="currentNode?.type === 'clone'"
          type="danger"
          @click="flattenCurrentClone"
        >
          展平克隆
        </el-button>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import TreeVisualization from '../components/TreeVisualization.vue'
import { poolApi, imageApi, treeApi, snapshotApi, cloneApi, warningApi } from '../api'
import { Warning, Download, ArrowDown } from '@element-plus/icons-vue'

const pools = ref([])
const selectedPool = ref('')
const images = ref([])
const selectedImage = ref('')
const layoutMode = ref('tree')
const showAll = ref(false)
const treeData = ref([])
const loading = ref(false)
const depthWarnings = ref([])

const detailVisible = ref(false)
const currentNode = ref(null)

const hasData = computed(() => treeData.value && treeData.value.length > 0)

const typeLabel = (type) => {
  const labels = {
    image: '镜像',
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
    ElMessage.error('加载快照树失败: ' + error)
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

const createCloneFromSnapshot = () => {
  ElMessage.info('请转到镜像管理页面创建克隆')
}

const protectCurrentSnapshot = async () => {
  if (!currentNode.value) return
  try {
    await snapshotApi.protect({
      image_name: selectedImage.value,
      snapshot_name: currentNode.value.name,
      pool: selectedPool.value
    })
    ElMessage.success('快照已保护')
    currentNode.value.is_protected = true
    loadTree()
  } catch (error) {
    ElMessage.error('操作失败: ' + error)
  }
}

const unprotectCurrentSnapshot = async () => {
  if (!currentNode.value) return
  try {
    await snapshotApi.unprotect({
      image_name: selectedImage.value,
      snapshot_name: currentNode.value.name,
      pool: selectedPool.value
    })
    ElMessage.success('快照已取消保护')
    currentNode.value.is_protected = false
    loadTree()
  } catch (error) {
    ElMessage.error('操作失败: ' + error)
  }
}

const loadDepthWarnings = async () => {
  try {
    depthWarnings.value = await warningApi.getDepthWarnings()
    if (depthWarnings.value.length === 0) {
      ElMessage.success('没有发现深度警告，所有克隆链都在安全范围内')
    }
  } catch (error) {
    ElMessage.error('加载深度警告失败: ' + error)
  }
}

const flattenCurrentClone = async () => {
  if (!currentNode.value || currentNode.value.type !== 'clone') return
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
    loadDepthWarnings()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('展平失败: ' + error)
    }
  }
}

const flattenClone = async (warning) => {
  try {
    await ElMessageBox.confirm(
      `确定要展平克隆镜像 ${warning.image_name} 吗？`,
      '展平确认',
      { type: 'warning' }
    )
    await cloneApi.flatten({
      image_name: warning.image_name,
      pool: warning.pool
    })
    ElMessage.success('克隆展平成功')
    loadDepthWarnings()
    loadTree()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('展平失败: ' + error)
    }
  }
}

const flattenAllWarnings = async () => {
  if (depthWarnings.value.length === 0) return
  try {
    await ElMessageBox.confirm(
      `确定要展平所有 ${depthWarnings.value.length} 个深层克隆吗？这将解决所有深度警告。`,
      '批量展平确认',
      { type: 'warning' }
    )
    const imageNames = depthWarnings.value.map(w => w.image_name)
    const result = await cloneApi.batchFlatten({
      image_names: imageNames,
      pool: selectedPool.value
    })
    ElMessage.success(`批量展平完成: 成功 ${result.success.length} 个, 失败 ${result.failed.length} 个`)
    loadDepthWarnings()
    loadTree()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('批量展平失败: ' + error)
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
.snapshot-tree {
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

.tree-wrapper {
  height: calc(100vh - 280px);
  min-height: 500px;
}
</style>
