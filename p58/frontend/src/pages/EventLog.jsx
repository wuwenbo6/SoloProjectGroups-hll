import { useState, useEffect } from 'react'
import { Bell, Check, AlertTriangle, Eye, RefreshCw } from 'lucide-react'
import axios from 'axios'

export default function EventLog() {
  const [events, setEvents] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ camera_id: '', type: '' })

  useEffect(() => {
    loadEvents()
    loadUnreadCount()
    
    const interval = setInterval(loadUnreadCount, 5000)
    return () => clearInterval(interval)
  }, [filter])

  const loadEvents = async () => {
    try {
      const params = {}
      if (filter.camera_id) params.camera_id = filter.camera_id
      
      const res = await axios.get('/api/events', { params })
      setEvents(res.data.events)
    } catch (err) {
      console.error('Failed to load events:', err)
    }
    setLoading(false)
  }

  const loadUnreadCount = async () => {
    try {
      const res = await axios.get('/api/events/unread-count')
      setUnreadCount(res.data.count)
    } catch (err) {
      console.error('Failed to load unread count:', err)
    }
  }

  const markAsRead = async (eventId) => {
    try {
      await axios.post(`/api/events/${eventId}/read`)
      setEvents(events.map(e => e.id === eventId ? { ...e, read: 1 } : e))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Failed to mark as read:', err)
    }
  }

  const markAllAsRead = async () => {
    for (const event of events.filter(e => !e.read)) {
      await markAsRead(event.id)
    }
  }

  const formatTime = (timeStr) => {
    const date = new Date(timeStr)
    return date.toLocaleString('zh-CN')
  }

  const getEventIcon = (eventType) => {
    switch (eventType) {
      case 'Motion':
        return <AlertTriangle className="text-yellow-500" size={20} />
      case 'VideoLoss':
        return <AlertTriangle className="text-red-500" size={20} />
      case 'Tampering':
        return <AlertTriangle className="text-orange-500" size={20} />
      default:
        return <Bell className="text-blue-500" size={20} />
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">事件日志</h2>
          {unreadCount > 0 && (
            <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">
              {unreadCount} 未读
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            <Check size={18} />
            全部已读
          </button>
          <button
            onClick={loadEvents}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            <RefreshCw size={18} />
            刷新
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">类型</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">摄像头</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">时间</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">状态</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    加载中...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    暂无事件
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id} className={!event.read ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getEventIcon(event.event_type)}
                        <span className="text-sm">{event.event_type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {event.camera_name || '未知'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatTime(event.event_time)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded ${
                        event.read 
                          ? 'bg-gray-100 text-gray-600' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {event.read ? '已读' : '未读'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!event.read && (
                        <button
                          onClick={() => markAsRead(event.id)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="标记已读"
                        >
                          <Check size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
