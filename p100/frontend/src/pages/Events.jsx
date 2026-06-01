import { useState, useEffect } from 'react'
import { Activity, Clock, Server } from 'lucide-react'
import axios from 'axios'

export default function Events() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEvents()
  }, [])

  const fetchEvents = async () => {
    try {
      const res = await axios.get('/api/events')
      setEvents(res.data.data || [])
    } catch (err) {
      console.error('Failed to fetch events:', err)
    }
    setLoading(false)
  }

  const getEventTypeColor = (type) => {
    switch (type) {
      case 'login_failed': return 'text-red-400 bg-red-500/10'
      case 'login_success': return 'text-green-400 bg-green-500/10'
      default: return 'text-gray-400 bg-gray-500/10'
    }
  }

  const getEventTypeText = (type) => {
    switch (type) {
      case 'login_failed': return '登录失败'
      case 'login_success': return '登录成功'
      default: return type
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Activity size={28} className="text-blue-400" />
        事件列表
      </h1>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold">安全事件</h2>
          <button
            onClick={fetchEvents}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            刷新
          </button>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Activity size={48} className="mx-auto mb-2 opacity-50" />
            <p>暂无事件</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">事件类型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">主机</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">来源</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">描述</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEventTypeColor(event.type)}`}>
                        {getEventTypeText(event.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Server size={14} className="text-gray-500" />
                        <span className="text-sm">{event.hostname || '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{event.source || '-'}</td>
                    <td className="px-4 py-3 text-sm max-w-xs truncate">{event.description || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Clock size={14} />
                        {new Date(event.timestamp).toLocaleString()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
