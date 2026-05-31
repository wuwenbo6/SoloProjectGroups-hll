<template>
  <div class="plans">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h3>用药计划管理</h3>
      <el-button type="primary" @click="showDialog = true; isEdit = false">
        <el-icon><Plus /></el-icon>
        添加计划
      </el-button>
    </div>

    <el-card style="margin-bottom: 20px;">
      <template #header>
        <span style="color: #E6A23C;"><el-icon><Warning /></el-icon> 低库存提醒</span>
      </template>
      <el-table :data="lowStockAlerts" stripe size="small" v-if="lowStockAlerts.length > 0">
        <el-table-column prop="user_name" label="用户" width="100" />
        <el-table-column prop="medicine_name" label="药品名称" />
        <el-table-column prop="remaining_pills" label="剩余数量" width="100">
          <template #default="scope">
            <el-tag type="danger">{{ scope.row.remaining_pills }} 片</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="threshold" label="阈值" width="80" />
        <el-table-column label="操作" width="100">
          <template #default="scope">
            <el-button size="small" type="primary" @click="openRefillDialog(scope.row.plan_id)">
              补充
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty description="暂无低库存药品" v-else :image-size="80" />
    </el-card>

    <el-card>
      <el-table :data="plans" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="user_id" label="用户ID" width="80" />
        <el-table-column prop="medicine_name" label="药品名称" />
        <el-table-column prop="dosage" label="剂量" />
        <el-table-column prop="pills_per_dose" label="每次片数" width="100" />
        <el-table-column label="库存" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.remaining_pills <= scope.row.refill_threshold ? 'danger' : 'success'">
              {{ scope.row.remaining_pills }} / {{ scope.row.total_pills }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="refill_threshold" label="阈值" width="80" />
        <el-table-column prop="take_time" label="服药时间" width="110" />
        <el-table-column prop="days_of_week" label="星期" width="140">
          <template #default="scope">
            {{ formatDays(scope.row.days_of_week) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="scope">
            <el-tag :type="scope.row.is_active ? 'success' : 'info'">
              {{ scope.row.is_active ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="scope">
            <el-button size="small" @click="openRefillDialog(scope.row.id)">补充</el-button>
            <el-button size="small" @click="viewRefills(scope.row.id)">记录</el-button>
            <el-button size="small" @click="editPlan(scope.row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deletePlan(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showDialog" :title="isEdit ? '编辑计划' : '添加计划'" width="550px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="用户">
          <el-select v-model="form.user_id" placeholder="请选择用户" style="width: 100%;">
            <el-option
              v-for="user in users"
              :key="user.id"
              :label="user.name"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="药盒">
          <el-select v-model="form.pillbox_id" placeholder="请选择药盒" style="width: 100%;">
            <el-option
              v-for="pillbox in pillboxes"
              :key="pillbox.id"
              :label="pillbox.name"
              :value="pillbox.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="药品名称">
          <el-input v-model="form.medicine_name" placeholder="请输入药品名称" />
        </el-form-item>
        <el-form-item label="剂量说明">
          <el-input v-model="form.dosage" placeholder="如：每次1粒，饭后服用" />
        </el-form-item>
        <el-form-item label="每次片数">
          <el-input-number v-model="form.pills_per_dose" :min="1" :max="10" />
        </el-form-item>
        <el-form-item label="总片数">
          <el-input-number v-model="form.total_pills" :min="0" />
        </el-form-item>
        <el-form-item label="剩余片数">
          <el-input-number v-model="form.remaining_pills" :min="0" />
        </el-form-item>
        <el-form-item label="提醒阈值">
          <el-input-number v-model="form.refill_threshold" :min="1" />
          <span style="color: #909399; margin-left: 10px;">低于此数量时提醒</span>
        </el-form-item>
        <el-form-item label="服药时间">
          <el-time-picker
            v-model="form.take_time"
            value-format="HH:mm:ss"
            placeholder="选择时间"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item label="重复星期">
          <el-checkbox-group v-model="selectedDays">
            <el-checkbox label="0">周一</el-checkbox>
            <el-checkbox label="1">周二</el-checkbox>
            <el-checkbox label="2">周三</el-checkbox>
            <el-checkbox label="3">周四</el-checkbox>
            <el-checkbox label="4">周五</el-checkbox>
            <el-checkbox label="5">周六</el-checkbox>
            <el-checkbox label="6">周日</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="savePlan">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showRefillDialog" title="补充药品" width="400px">
      <el-form label-width="100px">
        <el-form-item label="药品名称">
          <el-input :value="currentPlan?.medicine_name" disabled />
        </el-form-item>
        <el-form-item label="当前库存">
          <el-tag type="info">{{ currentPlan?.remaining_pills }} 片</el-tag>
        </el-form-item>
        <el-form-item label="补充数量">
          <el-input-number v-model="refillForm.added_count" :min="1" :max="1000" />
        </el-form-item>
        <el-form-item label="补充后">
          <el-tag type="success">
            {{ (currentPlan?.remaining_pills || 0) + refillForm.added_count }} 片
          </el-tag>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="refillForm.note" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRefillDialog = false">取消</el-button>
        <el-button type="primary" @click="submitRefill">确认补充</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showRefillHistory" title="补药记录" width="500px">
      <el-table :data="refillHistory" stripe size="small">
        <el-table-column prop="previous_count" label="补充前" width="90" />
        <el-table-column prop="added_count" label="补充" width="80">
          <template #default="scope">
            <span style="color: #67C23A;">+{{ scope.row.added_count }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="new_count" label="补充后" width="90" />
        <el-table-column prop="refill_date" label="时间" width="160">
          <template #default="scope">
            {{ formatTime(scope.row.refill_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注" />
      </el-table>
      <el-empty description="暂无记录" v-if="refillHistory.length === 0" :image-size="80" />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { planApi, userApi, pillboxApi, alertApi } from '../api'
import dayjs from 'dayjs'

const plans = ref([])
const users = ref([])
const pillboxes = ref([])
const lowStockAlerts = ref([])
const showDialog = ref(false)
const showRefillDialog = ref(false)
const showRefillHistory = ref(false)
const isEdit = ref(false)
const editId = ref(null)
const selectedDays = ref([])
const currentPlanId = ref(null)
const currentPlan = ref(null)
const refillHistory = ref([])

const form = ref({
  user_id: null,
  pillbox_id: null,
  medicine_name: '',
  dosage: '',
  pills_per_dose: 1,
  total_pills: 0,
  remaining_pills: 0,
  refill_threshold: 10,
  take_time: '',
  days_of_week: '',
  is_active: true
})

const refillForm = ref({
  added_count: 30,
  note: ''
})

const daysMap = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const formatDays = (daysStr) => {
  if (!daysStr) return '-'
  return daysStr.split(',').map(d => daysMap[parseInt(d)]).join(', ')
}

const formatTime = (time) => {
  return dayjs(time).format('YYYY-MM-DD HH:mm')
}

const loadPlans = async () => {
  try {
    const res = await planApi.list()
    plans.value = res.data
  } catch (error) {
    console.error('加载计划失败:', error)
  }
}

const loadLowStockAlerts = async () => {
  try {
    const res = await alertApi.getLowStock()
    lowStockAlerts.value = res.data
  } catch (error) {
    console.error('加载低库存提醒失败:', error)
  }
}

const loadUsers = async () => {
  try {
    const res = await userApi.list()
    users.value = res.data
  } catch (error) {
    console.error('加载用户失败:', error)
  }
}

const loadPillboxes = async () => {
  try {
    const res = await pillboxApi.list()
    pillboxes.value = res.data
  } catch (error) {
    console.error('加载药盒失败:', error)
  }
}

const editPlan = (plan) => {
  isEdit.value = true
  editId.value = plan.id
  form.value = { ...plan }
  selectedDays.value = plan.days_of_week ? plan.days_of_week.split(',') : []
  showDialog.value = true
}

const deletePlan = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除该计划吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await planApi.delete(id)
    ElMessage.success('删除成功')
    loadPlans()
    loadLowStockAlerts()
  } catch {
  }
}

const savePlan = async () => {
  form.value.days_of_week = selectedDays.value.join(',')
  
  if (!form.value.user_id || !form.value.pillbox_id || !form.value.medicine_name) {
    ElMessage.warning('请填写完整信息')
    return
  }
  
  try {
    if (isEdit.value) {
      await planApi.update(editId.value, form.value)
      ElMessage.success('更新成功')
    } else {
      await planApi.create(form.value)
      ElMessage.success('添加成功')
    }
    showDialog.value = false
    resetForm()
    loadPlans()
    loadLowStockAlerts()
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const resetForm = () => {
  form.value = {
    user_id: null,
    pillbox_id: null,
    medicine_name: '',
    dosage: '',
    pills_per_dose: 1,
    total_pills: 0,
    remaining_pills: 0,
    refill_threshold: 10,
    take_time: '',
    days_of_week: '',
    is_active: true
  }
  selectedDays.value = []
}

const openRefillDialog = (planId) => {
  currentPlanId.value = planId
  currentPlan.value = plans.value.find(p => p.id === planId)
  refillForm.value = { added_count: 30, note: '' }
  showRefillDialog.value = true
}

const submitRefill = async () => {
  try {
    await planApi.refill(currentPlanId.value, refillForm.value)
    ElMessage.success('补充成功')
    showRefillDialog.value = false
    loadPlans()
    loadLowStockAlerts()
  } catch (error) {
    ElMessage.error('补充失败')
  }
}

const viewRefills = async (planId) => {
  try {
    const res = await planApi.getRefills(planId)
    refillHistory.value = res.data
    showRefillHistory.value = true
  } catch (error) {
    ElMessage.error('加载记录失败')
  }
}

onMounted(() => {
  loadPlans()
  loadUsers()
  loadPillboxes()
  loadLowStockAlerts()
})
</script>
