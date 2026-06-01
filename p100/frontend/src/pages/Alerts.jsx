import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle, Clock, User } from 'lucide-react'
import axios from 'axios'

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAlerts()
  }, [])

  const fetchAlerts = async () => {
    try {
      const res = await axios.get('/api/alerts')
      setAlerts(res.data.data || [])
    } catch (err) {
      console.error('Failed to fetch alerts:', err)
    }
    setLoading(false)
  }

  const updateAlertStatus = async (id, status) => {
    try {
      await axios.put(`/api/alerts/${id}/status`, { status })
      fetchAlerts()
      if (selectedAlert?.id === id) {
        setSelectedAlert({ ...selectedAlert, status })
      }
    } catch (err) {
      console.error('Failed to update alert status:', err)
    }
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'bg-red-500'
      case 'medium': return 'bg-yellow-500'
      case 'low': return 'bg-green-500'
      default: return 'bg-gray-500'
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

  const getStatusBadge = (status) => {
    switch (status) {
      case 'new': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'acknowledged': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'resolved': return 'bg-green-500/20 text-green-400 border-green-500/30'
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'new': return '新告警'
      case 'acknowledged': return '已确认'
      case 'resolved': return '已解决'
      default: return status
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <AlertTriangle size={28} className="text-red-400" />
        告警管理
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h2 className="font-semibold">告警列表</h2>
            </div>
            
            {loading ? (
              <div className="p-8 text-center text-gray-500">加载中...</div>
            ) : alerts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <AlertTriangle size={48} className="mx-auto mb-2 opacity-50" />
                <p>暂无告警</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700 max-h-[600px] overflow-auto scrollbar-thin">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    onClick={() => setSelectedAlert(alert)}
                    className={`p-4 cursor-pointer hover:bg-gray-700/50 transition-colors ${
                      selectedAlert?.id === alert.id ? 'bg-gray-700' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className={`w-3 h-3 rounded-full mt-1 ${getSeverityColor(alert.severity)}`}></span>
                        <div>
                          <h3 className="font-medium">{alert.rule_name}</h3>
                          <p className="text-sm text-gray-400 mt-1">{alert.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs">
                            <span className="flex items-center gap-1 text-gray-500">
                              <Clock size={12} />
                              {new Date(alert.timestamp).toLocaleString()}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full border ${getStatusBadge(alert.status)}`}>
                              {getStatusText(alert.status)}
                            </span>
                            <span className="text-gray-500">
                              {alert.event_ids?.length || 0} 个事件
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          {selectedAlert ? (
            <div className="bg-gray-800 rounded-xl border border-gray-700 sticky top-6">
              <div className="p-4 border-b border-gray-700">
                <h2 className="font-semibold">告警详情</h2>
              </div>
              
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide">规则名称</label>
                  <p className="font-medium mt-1">{selectedAlert.rule_name}</p>
                </div>

                <div className="flex gap-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">严重程度</label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`w-3 h-3 rounded-full ${getSeverityColor(selectedAlert.severity)}`}></span>
                      <span>{getSeverityText(selectedAlert.severity)}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wide">状态</label>
                    <span className={`inline-block px-2 py-0.5 rounded-full border mt-1 ${getStatusBadge(selectedAlert.status)}`}>
                      {getStatusText(selectedAlert.status)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide">描述</label>
                  <p className="text-sm mt-1">{selectedAlert.description}</p>
                </div>

                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide">触发时间</label>
                  <p className="text-sm mt-1">{new Date(selectedAlert.timestamp).toLocaleString()}</p>
                </div>

                <div className="flex gap-2 pt-2">
                  {selectedAlert.status === 'new' && (
                    <button
                      onClick={() => updateAlertStatus(selectedAlert.id, 'acknowledged')}
                      className="flex-1 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm transition-colors"
                    >
                      确认告警
                    </button>
                  )}
                  {selectedAlert.status === 'acknowledged' && (
                    <button
                      onClick={() => updateAlertStatus(selectedAlert.id, 'resolved')}
                      className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm transition-colors flex items-center justify-center gap-1"
                    >
                      <CheckCircle size={14} />
                      标记已解决
                    </button>
                  )}
                </div>

                {selectedAlert.events && selectedAlert.events.length > 0 && (
                  <div className="border-t border-gray-700 pt-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <User size={16} />
                      事件链 ({selectedAlert.events.length}个事件)
                    </h3>
                    <div className="space-y-3">
                      {selectedAlert.events.map((event, idx) => (
                        <div key={idx} className="relative pl-4 pb-3 border-l-2 border-blue-500 last:pb-0">
                          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                            <span className="text-xs">{idx + 1}</span>
                          </div>
                          <div className="bg-gray-700/50 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-blue-400">{event.type}</span>
                              <span className="text-xs text-gray-500">
                                {new Date(event.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">{event.description}</p>
                            {event.attributes?.username && (
                              <p className="text-xs text-gray-500 mt-1">
                                用户: {event.attributes.username}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center text-gray-500">
              <AlertTriangle size={48} className="mx-auto mb-2 opacity-50" />
              <p>选择一个告警查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
