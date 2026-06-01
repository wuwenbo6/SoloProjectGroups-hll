<template>
  <div class="image-manager">
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
            <el-input
              v-model="searchText"
              placeholder="搜索镜像名称"
              style="width: 300px"
              clearable
              :prefix-icon="Search"
            />
          </div>
          <el-button type="primary" :icon="Plus" @click="showCreateDialog">
            创建镜像
          </el-button>
        </div>
      </template>

      <el-table :data="filteredImages" v-loading="loading" style="width: 100%">
        <el-table-column prop="name" label="镜像名称" min-width="150" />
        <el-table-column label="大小 (GB)" width="120">
          <template #default="scope">{{ formatSize(scope.row.size) }}</template>
        </el-table-column>
        <el-table-column prop="objects" label="对象数" width="100" />
        <el-table-column label="特性" min-width="200">
          <template #default="scope">
            <el-tag
              v-for="feature in scope.row.features"
              :key="feature"
              size="small"
              style="margin-right: 4px; margin-bottom: 4px"
            >
              {{ feature }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="父镜像" min-width="180">
          <template #default="scope">
            <span v-if="scope.row.parent">
              {{ scope.row.parent.image }}@{{ scope.row.parent.snapshot }}
            </span>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="scope">
            <el-button type="primary" link @click="viewSnapshots(scope.row)">
              快照
            </el-button>
            <el-button type="success" link @click="showCloneDialog(scope.row)">
              克隆
            </el-button>
            <el-button
              v-if="scope.row.parent"
              type="warning"
              link
              @click="flattenClone(scope.row)"
            >
              展平
            </el-button>
            <el-button type="danger" link @click="deleteImage(scope.row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="createDialogVisible" title="创建镜像" width="500px">
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="镜像名称">
          <el-input v-model="createForm.name" placeholder="请输入镜像名称" />
        </el-form-item>
        <el-form-item label="存储池">
          <el-select v-model="createForm.pool" placeholder="选择存储池" style="width: 100%">
            <el-option
              v-for="pool in pools"
              :key="pool"
              :label="pool"
              :value="pool"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="大小 (GB)">
          <el-input-number v-model="createForm.sizeGb" :min="1" :max="10240" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createImage" :loading="creating">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="snapshotDialogVisible" :title="`镜像 ${currentImage?.name} 的快照`" width="700px">
      <div style="margin-bottom: 12px">
        <el-button type="primary" :icon="Plus" @click="showCreateSnapshotDialog">
          创建快照
        </el-button>
      </div>
      <el-table :data="snapshots" v-loading="snapshotLoading" style="width: 100%">
        <el-table-column prop="name" label="快照名称" />
        <el-table-column prop="id" label="快照ID" width="100" />
        <el-table-column label="大小 (GB)" width="120">
          <template #default="scope">{{ formatSize(scope.row.size) }}</template>
        </el-table-column>
        <el-table-column label="是否受保护" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.is_protected ? 'success' : 'info'" size="small">
              {{ scope.row.is_protected ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280">
          <template #default="scope">
            <el-button
              v-if="!scope.row.is_protected"
              type="success"
              link
              @click="protectSnapshot(scope.row)"
            >
              保护
            </el-button>
            <el-button
              v-else
              type="warning"
              link
              @click="unprotectSnapshot(scope.row)"
            >
              取消保护
            </el-button>
            <el-button type="primary" link @click="showCloneFromSnapshot(scope.row)">
              克隆
            </el-button>
            <el-button type="danger" link @click="deleteSnapshot(scope.row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="createSnapshotDialogVisible" title="创建快照" width="400px">
      <el-form :model="createSnapshotForm" label-width="100px">
        <el-form-item label="快照名称">
          <el-input v-model="createSnapshotForm.name" placeholder="请输入快照名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createSnapshotDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createSnapshot" :loading="creatingSnapshot">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="cloneDialogVisible" title="创建克隆" width="500px">
      <el-form :model="cloneForm" label-width="120px">
        <el-form-item label="父镜像">
          <el-input :value="cloneForm.parent_image" disabled />
        </el-form-item>
        <el-form-item label="父快照">
          <el-select v-model="cloneForm.parent_snapshot" placeholder="选择快照" style="width: 100%">
            <el-option
              v-for="snap in snapshots"
              :key="snap.name"
              :label="snap.name"
              :value="snap.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="克隆名称">
          <el-input v-model="cloneForm.child_image" placeholder="请输入克隆镜像名称" />
        </el-form-item>
        <el-form-item label="目标存储池">
          <el-select v-model="cloneForm.child_pool" placeholder="选择存储池" style="width: 100%">
            <el-option
              v-for="pool in pools"
              :key="pool"
              :label="pool"
              :value="pool"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cloneDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createClone" :loading="cloning">创建克隆</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { poolApi, imageApi, snapshotApi, cloneApi } from '../api'

const route = useRoute()
const loading = ref(false)
const pools = ref([])
const selectedPool = ref('')
const searchText = ref('')
const images = ref([])

const createDialogVisible = ref(false)
const createForm = ref({
  name: '',
  pool: '',
  sizeGb: 10
})
const creating = ref(false)

const snapshotDialogVisible = ref(false)
const createSnapshotDialogVisible = ref(false)
const currentImage = ref(null)
const snapshots = ref([])
const snapshotLoading = ref(false)
const createSnapshotForm = ref({ name: '' })
const creatingSnapshot = ref(false)

const cloneDialogVisible = ref(false)
const cloneForm = ref({
  parent_pool: '',
  parent_image: '',
  parent_snapshot: '',
  child_pool: '',
  child_image: ''
})
const cloning = ref(false)

const filteredImages = computed(() => {
  if (!searchText.value) return images.value
  return images.value.filter(img =>
    img.name.toLowerCase().includes(searchText.value.toLowerCase())
  )
})

const formatSize = (bytes) => {
  if (!bytes) return '0'
  return (bytes / 1024 / 1024 / 1024).toFixed(2)
}

const loadPools = async () => {
  try {
    pools.value = await poolApi.list()
    if (pools.value.length > 0) {
      selectedPool.value = route.query.pool || pools.value[0]
      createForm.value.pool = selectedPool.value
      loadImages()
    }
  } catch (error) {
    ElMessage.error('加载存储池失败: ' + error)
  }
}

const loadImages = async () => {
  if (!selectedPool.value) return
  loading.value = true
  try {
    const imageNames = await imageApi.list(selectedPool.value)
    const imageDetails = []
    for (const name of imageNames) {
      try {
        const info = await imageApi.get(name, selectedPool.value)
        imageDetails.push(info)
      } catch (e) {
        console.warn(`Failed to load info for ${name}:`, e)
        imageDetails.push({ name, size: 0, objects: 0, features: [], parent: null })
      }
    }
    images.value = imageDetails
  } catch (error) {
    ElMessage.error('加载镜像列表失败: ' + error)
  } finally {
    loading.value = false
  }
}

const showCreateDialog = () => {
  createForm.value = { name: '', pool: selectedPool.value, sizeGb: 10 }
  createDialogVisible.value = true
}

const createImage = async () => {
  if (!createForm.value.name || !createForm.value.sizeGb) {
    ElMessage.warning('请填写完整信息')
    return
  }
  creating.value = true
  try {
    await imageApi.create({
      name: createForm.value.name,
      size: createForm.value.sizeGb * 1024 * 1024 * 1024,
      pool: createForm.value.pool
    })
    ElMessage.success('镜像创建成功')
    createDialogVisible.value = false
    loadImages()
  } catch (error) {
    ElMessage.error('创建失败: ' + error)
  } finally {
    creating.value = false
  }
}

const deleteImage = async (image) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除镜像 ${image.name} 吗？此操作不可恢复！`,
      '删除确认',
      { type: 'warning' }
    )
    await imageApi.delete({ name: image.name, pool: selectedPool.value })
    ElMessage.success('镜像删除成功')
    loadImages()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败: ' + error)
    }
  }
}

const viewSnapshots = async (image) => {
  currentImage.value = image
  snapshotDialogVisible.value = true
  await loadSnapshots()
}

const loadSnapshots = async () => {
  if (!currentImage.value) return
  snapshotLoading.value = true
  try {
    snapshots.value = await snapshotApi.list(currentImage.value.name, selectedPool.value)
  } catch (error) {
    ElMessage.error('加载快照列表失败: ' + error)
  } finally {
    snapshotLoading.value = false
  }
}

const showCreateSnapshotDialog = () => {
  createSnapshotForm.value = { name: '' }
  createSnapshotDialogVisible.value = true
}

const createSnapshot = async () => {
  if (!createSnapshotForm.value.name) {
    ElMessage.warning('请输入快照名称')
    return
  }
  creatingSnapshot.value = true
  try {
    await snapshotApi.create({
      image_name: currentImage.value.name,
      snapshot_name: createSnapshotForm.value.name,
      pool: selectedPool.value
    })
    ElMessage.success('快照创建成功')
    createSnapshotDialogVisible.value = false
    loadSnapshots()
  } catch (error) {
    ElMessage.error('创建失败: ' + error)
  } finally {
    creatingSnapshot.value = false
  }
}

const protectSnapshot = async (snapshot) => {
  try {
    await snapshotApi.protect({
      image_name: currentImage.value.name,
      snapshot_name: snapshot.name,
      pool: selectedPool.value
    })
    ElMessage.success('快照已保护')
    loadSnapshots()
  } catch (error) {
    ElMessage.error('操作失败: ' + error)
  }
}

const unprotectSnapshot = async (snapshot) => {
  try {
    await snapshotApi.unprotect({
      image_name: currentImage.value.name,
      snapshot_name: snapshot.name,
      pool: selectedPool.value
    })
    ElMessage.success('快照已取消保护')
    loadSnapshots()
  } catch (error) {
    ElMessage.error('操作失败: ' + error)
  }
}

const deleteSnapshot = async (snapshot) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除快照 ${snapshot.name} 吗？`,
      '删除确认',
      { type: 'warning' }
    )
    await snapshotApi.delete({
      image_name: currentImage.value.name,
      snapshot_name: snapshot.name,
      pool: selectedPool.value
    })
    ElMessage.success('快照删除成功')
    loadSnapshots()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败: ' + error)
    }
  }
}

const showCloneDialog = async (image) => {
  currentImage.value = image
  cloneForm.value = {
    parent_pool: selectedPool.value,
    parent_image: image.name,
    parent_snapshot: '',
    child_pool: selectedPool.value,
    child_image: ''
  }
  await loadSnapshots()
  cloneDialogVisible.value = true
}

const showCloneFromSnapshot = async (snapshot) => {
  cloneForm.value = {
    parent_pool: selectedPool.value,
    parent_image: currentImage.value.name,
    parent_snapshot: snapshot.name,
    child_pool: selectedPool.value,
    child_image: ''
  }
  cloneDialogVisible.value = true
}

const createClone = async () => {
  if (!cloneForm.value.parent_snapshot || !cloneForm.value.child_image) {
    ElMessage.warning('请填写完整信息')
    return
  }
  cloning.value = true
  try {
    await cloneApi.create(cloneForm.value)
    ElMessage.success('克隆创建成功')
    cloneDialogVisible.value = false
    snapshotDialogVisible.value = false
    loadImages()
  } catch (error) {
    ElMessage.error('创建失败: ' + error)
  } finally {
    cloning.value = false
  }
}

const flattenClone = async (image) => {
  try {
    await ElMessageBox.confirm(
      `确定要展平克隆镜像 ${image.name} 吗？展平后将与父镜像断开关联。`,
      '展平确认',
      { type: 'warning' }
    )
    await cloneApi.flatten({ image_name: image.name, pool: selectedPool.value })
    ElMessage.success('克隆展平成功')
    loadImages()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('展平失败: ' + error)
    }
  }
}

onMounted(() => {
  loadPools()
})
</script>

<style scoped>
.image-manager {
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

.text-muted {
  color: #909399;
}
</style>
