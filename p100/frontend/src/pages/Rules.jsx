import { useState, useEffect } from 'react'
import { FileCode, Plus, Trash2, Edit2, X, Save } from 'lucide-react'
import axios from 'axios'

export default function Rules() {
  const [rules, setRules] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    severity: 'medium',
    enabled: true,
    event_type: '',
    condition: '',
    correlation: {
      type: 'count',
      group_by_field: 'username',
      time_window_seconds: 300,
      min_count: 3,
      event_sequence: []
    },
    action: 'create_alert'
  })

  useEffect(() => {
    fetchRules()
  }, [])

  const fetchRules = async () => {
    try {
      const res = await axios.get('/api/rules')
      setRules(res.data.data || [])
    } catch (err) {
      console.error('Failed to fetch rules:', err)
    }
    setLoading(false)
  }

  const openCreateModal = () => {
    setEditingRule(null)
    setFormData({
      name: '',
      description: '',
      severity: 'medium',
      enabled: true,
      event_type: '',
      condition: '',
      correlation: {
        type: 'count',
        group_by_field: 'username',
        time_window_seconds: 300,
        min_count: 3,
        event_sequence: []
      },
      action: 'create_alert'
    })
    setShowModal(true)
  }

  const openEditModal = (rule) => {
    setEditingRule(rule)
    setFormData({
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      enabled: rule.enabled,
      event_type: rule.event_type || '',
      condition: rule.condition || '',
      correlation: rule.correlation || {
        type: 'count',
        group_by_field: 'username',
        time_window_seconds: 300,
        min_count: 3,
        event_sequence: []
      },
      action: rule.action || 'create_alert'
    })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingRule) {
        await axios.put(`/api/rules/${editingRule.id}`, formData)
      } else {
        await axios.post('/api/rules', formData)
      }
      fetchRules()
      setShowModal(false)
    } catch (err) {
      console.error('Failed to save rule:', err)
    }
  }

  const handleDelete = async (id) => {
    if (confirm('确定要删除这个规则吗？')) {
      try {
        await axios.delete(`/api/rules/${id}`)
        fetchRules()
      } catch (err) {
        console.error('Failed to delete rule:', err)
      }
    }
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-500/10 border-red-500/30'
      case 'medium': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
      case 'low': return 'text-green-400 bg-green-500/10 border-green-500/30'
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/30'
    }
  }

  const getSeverityText = (severity) => {
    switch (severity) {
      case 'high': return '高'
      case 'medium': return '中'
      case 'low': return '低'
      default: return severity
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileCode size={28} className="text-green-400" />
          规则管理
        </h1>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
        >
          <Plus size={18} />
          创建规则
        </button>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileCode size={48} className="mx-auto mb-2 opacity-50" />
            <p>暂无规则</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {rules.map((rule) => (
              <div key={rule.id} className="p-4 hover:bg-gray-700/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{rule.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${getSeverityColor(rule.severity)}`}>
                        {getSeverityText(rule.severity)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        rule.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {rule.enabled ? '已启用' : '已禁用'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{rule.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {rule.correlation && (
                        <>
                          <span>类型: {rule.correlation.type === 'count' ? '计数' : '序列'}</span>
                          <span>窗口: {rule.correlation.time_window_seconds}秒</span>
                          {rule.correlation.type === 'count' && (
                            <span>阈值: {rule.correlation.min_count}次</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(rule)}
                      className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-lg">
                {editingRule ? '编辑规则' : '创建规则'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">规则名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">严重程度</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">事件类型</label>
                  <input
                    type="text"
                    value={formData.event_type}
                    onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="如: login_failed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">关联类型</label>
                  <select
                    value={formData.correlation.type}
                    onChange={(e) => setFormData({
                      ...formData,
                      correlation: { ...formData.correlation, type: e.target.value }
                    })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="count">计数 (count)</option>
                    <option value="sequence">序列 (sequence)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">条件表达式 (JavaScript)</label>
                <input
                  type="text"
                  value={formData.condition}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-sm"
                  placeholder="event.type == 'login_failed'"
                />
                <p className="text-xs text-gray-500 mt-1">
                  可用变量: event.type, event.hostname, event.source, event.attributes
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">分组字段</label>
                  <input
                    type="text"
                    value={formData.correlation.group_by_field}
                    onChange={(e) => setFormData({
                      ...formData,
                      correlation: { ...formData.correlation, group_by_field: e.target.value }
                    })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">时间窗口 (秒)</label>
                  <input
                    type="number"
                    value={formData.correlation.time_window_seconds}
                    onChange={(e) => setFormData({
                      ...formData,
                      correlation: { ...formData.correlation, time_window_seconds: parseInt(e.target.value) }
                    })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                {formData.correlation.type === 'count' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">最小计数</label>
                    <input
                      type="number"
                      value={formData.correlation.min_count}
                      onChange={(e) => setFormData({
                        ...formData,
                        correlation: { ...formData.correlation, min_count: parseInt(e.target.value) }
                      })}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="enabled" className="text-sm">启用规则</label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                >
                  <Save size={16} />
                  {editingRule ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
