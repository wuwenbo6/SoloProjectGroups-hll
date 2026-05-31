import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Clock, HardDrive } from 'lucide-react'
import axios from 'axios'

const DAYS = [
  { value: '0', label: '周日' },
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
]

export default function RecordingSchedules() {
  const [schedules, setSchedules] = useState([])
  const [cameras, setCameras] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [formData, setFormData] = useState({
    camera_id: '',
    name: '',
    days_of_week: [],
    start_time: '00:00',
    end_time: '23:59',
    storage_path: '',
    segment_duration: 300,
    enabled: 1
  })

  useEffect(() => {
    loadSchedules()
    loadCameras()
  }, [])

  const loadSchedules = async () => {
    try {
      const res = await axios.get('/api/recording/schedules')
      setSchedules(res.data.schedules)
    } catch (err) {
      console.error('Failed to load schedules:', err)
    }
  }

  const loadCameras = async () => {
    try {
      const res = await axios.get('/api/cameras')
      setCameras(res.data.cameras)
    } catch (err) {
      console.error('Failed to load cameras:', err)
    }
  }

  const openModal = (schedule = null) => {
    if (schedule) {
      setEditingSchedule(schedule)
      setFormData({
        camera_id: schedule.camera_id,
        name: schedule.name,
        days_of_week: schedule.days_of_week.split(','),
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        storage_path: schedule.storage_path || '',
        segment_duration: schedule.segment_duration,
        enabled: schedule.enabled
      })
    } else {
      setEditingSchedule(null)
      setFormData({
        camera_id: cameras[0]?.id || '',
        name: '',
        days_of_week: ['1', '2', '3', '4', '5'],
        start_time: '09:00',
        end_time: '18:00',
        storage_path: '',
        segment_duration: 300,
        enabled: 1
      })
    }
    setShowModal(true)
  }

  const handleSubmit = async () => {
    try {
      const data = {
        ...formData,
        days_of_week: formData.days_of_week.join(',')
      }

      if (editingSchedule) {
        await axios.put(`/api/recording/schedules/${editingSchedule.id}`, data)
      } else {
        await axios.post('/api/recording/schedules', data)
      }

      setShowModal(false)
      loadSchedules()
    } catch (err) {
      alert('保存失败: ' + err.response?.data?.error)
    }
  }

  const deleteSchedule = async (id) => {
    if (confirm('确定要删除这个录像计划吗？')) {
      try {
        await axios.delete(`/api/recording/schedules/${id}`)
        loadSchedules()
      } catch (err) {
        console.error('Delete failed:', err)
      }
    }
  }

  const toggleSchedule = async (schedule) => {
    try {
      await axios.put(`/api/recording/schedules/${schedule.id}`, {
        enabled: schedule.enabled ? 0 : 1
      })
      loadSchedules()
    } catch (err) {
      console.error('Toggle failed:', err)
    }
  }

  const toggleDay = (dayValue) => {
    const days = formData.days_of_week.includes(dayValue)
      ? formData.days_of_week.filter(d => d !== dayValue)
      : [...formData.days_of_week, dayValue]
    setFormData({ ...formData, days_of_week: days })
  }

  const formatDays = (daysStr) => {
    const days = daysStr.split(',')
    return days.map(d => DAYS.find(day => day.value === d)?.label).join(', ')
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">录像计划</h2>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
        >
          <Plus size={18} />
          添加计划
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Clock size={48} className="mx-auto mb-4 opacity-50" />
          <p>暂无录像计划</p>
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">{schedule.name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      schedule.enabled 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {schedule.enabled ? '启用' : '禁用'}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-gray-600 space-y-1">
                    <div className="flex items-center gap-2">
                      <span>摄像头:</span>
                      <span className="font-medium">{schedule.camera_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>时间:</span>
                      <span>{schedule.start_time} - {schedule.end_time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>重复:</span>
                      <span>{formatDays(schedule.days_of_week)}</span>
                    </div>
                    {schedule.storage_path && (
                      <div className="flex items-center gap-2">
                        <HardDrive size={16} />
                        <span>存储位置: {schedule.storage_path}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleSchedule(schedule)}
                    className={`px-3 py-1 text-sm rounded ${
                      schedule.enabled
                        ? 'bg-red-100 text-red-600 hover:bg-red-200'
                        : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}
                  >
                    {schedule.enabled ? '禁用' : '启用'}
                  </button>
                  <button
                    onClick={() => openModal(schedule)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => deleteSchedule(schedule.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingSchedule ? '编辑录像计划' : '添加录像计划'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">计划名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="例如: 工作日录像"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">摄像头</label>
                <select
                  value={formData.camera_id}
                  onChange={(e) => setFormData({ ...formData, camera_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>{cam.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">重复</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day) => (
                    <button
                      key={day.value}
                      onClick={() => toggleDay(day.value)}
                      className={`px-3 py-1 rounded text-sm ${
                        formData.days_of_week.includes(day.value)
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">开始时间</label>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">结束时间</label>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">存储路径 (NAS)</label>
                <input
                  type="text"
                  value={formData.storage_path}
                  onChange={(e) => setFormData({ ...formData, storage_path: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="/mnt/nas/cameras"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">分段时长 (秒)</label>
                <input
                  type="number"
                  value={formData.segment_duration}
                  onChange={(e) => setFormData({ ...formData, segment_duration: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
