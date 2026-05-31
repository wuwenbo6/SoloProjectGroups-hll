<template>
  <div class="page-container">
    <div class="flex-between mb-24">
      <h2 class="page-title">区域配置管理</h2>
      <el-button type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon>
        新增区域
      </el-button>
    </div>

    <el-card class="card-shadow">
      <el-table :data="zones" border>
        <el-table-column prop="zone_id" label="区域ID" width="150" />
        <el-table-column prop="name" label="区域名称" width="150" />
        <el-table-column label="位置信息">
          <template #default="{ row }">
            X: {{ row.x }} Y: {{ row.y }}
            宽: {{ row.width }} 高: {{ row.height }}
          </template>
        </el-table-column>
        <el-table-column prop="max_capacity" label="最大容量" width="120" />
        <el-table-column prop="ap_ids" label="关联AP" width="200">
          <template #default="{ row }">
            <el-tag v-for="ap in row.ap_ids" :key="ap" size="small" style="margin-right: 4px;">
              {{ ap }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" link @click="editZone(row)">编辑</el-button>
            <el-button type="danger" size="small" link @click="deleteZone(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="showAddDialog"
      :title="editingZone ? '编辑区域' : '新增区域'"
      width="600px"
    >
      <el-form :model="formData" label-width="100px">
        <el-form-item label="区域ID" prop="zone_id">
          <el-input v-model="formData.zone_id" :disabled="!!editingZone" />
        </el-form-item>
        <el-form-item label="区域名称" prop="name">
          <el-input v-model="formData.name" />
        </el-form-item>
        <el-form-item label="X坐标" prop="x">
          <el-slider v-model="formData.x" :min="0" :max="1" :step="0.01" :show-tooltip="true" />
        </el-form-item>
        <el-form-item label="Y坐标" prop="y">
          <el-slider v-model="formData.y" :min="0" :max="1" :step="0.01" :show-tooltip="true" />
        </el-form-item>
        <el-form-item label="宽度" prop="width">
          <el-slider v-model="formData.width" :min="0.05" :max="1" :step="0.01" :show-tooltip="true" />
        </el-form-item>
        <el-form-item label="高度" prop="height">
          <el-slider v-model="formData.height" :min="0.05" :max="1" :step="0.01" :show-tooltip="true" />
        </el-form-item>
        <el-form-item label="最大容量" prop="max_capacity">
          <el-input-number v-model="formData.max_capacity" :min="10" :max="1000" />
        </el-form-item>
        <el-form-item label="关联AP" prop="ap_ids">
          <el-select v-model="formData.ap_ids" multiple placeholder="选择关联的AP">
            <el-option label="AP-001" value="AP-001" />
            <el-option label="AP-002" value="AP-002" />
            <el-option label="AP-003" value="AP-003" />
            <el-option label="AP-004" value="AP-004" />
            <el-option label="AP-005" value="AP-005" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="saveZone">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getZones, createZone } from '@/api'

const zones = ref([])
const showAddDialog = ref(false)
const editingZone = ref(null)

const formData = reactive({
  zone_id: '',
  name: '',
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.2,
  max_capacity: 100,
  ap_ids: []
})

const loadZones = async () => {
  try {
    const res = await getZones()
    zones.value = res.data
  } catch (e) {
    console.error('Load zones error:', e)
  }
}

const editZone = (row) => {
  editingZone.value = row
  Object.assign(formData, {
    zone_id: row.zone_id,
    name: row.name,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    max_capacity: row.max_capacity,
    ap_ids: [...row.ap_ids]
  })
  showAddDialog.value = true
}

const deleteZone = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除该区域吗？', '提示', {
      type: 'warning'
    })
    ElMessage.success('删除成功')
    await loadZones()
  } catch {
  }
}

const saveZone = async () => {
  try {
    await createZone(formData)
    ElMessage.success(editingZone.value ? '编辑成功' : '新增成功')
    showAddDialog.value = false
    resetForm()
    await loadZones()
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

const resetForm = () => {
  editingZone.value = null
  Object.assign(formData, {
    zone_id: '',
    name: '',
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    max_capacity: 100,
    ap_ids: []
  })
}

onMounted(() => {
  loadZones()
})
</script>
