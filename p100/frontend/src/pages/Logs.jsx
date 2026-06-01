import { useState, useEffect } from 'react'
import { ScrollText, Clock, Server, HardDrive } from 'lucide-react'
import axios from 'axios'

export default function Logs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    try {
      const res = await axios.get('/api/logs')
      setLogs(res.data.data || [])
    } catch (err) {
      console.error('Failed to fetch logs:', err)
    }
    setLoading(false)
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'emergency':
      case 'alert':
      case 'critical':
      case 'error':
        return 'text-red-400 bg-red-500/10'
      case 'warning':
        return 'text-yellow-400 bg-yellow-500/10'
      case 'notice':
      case 'info':
        return 'text-blue-400 bg-blue-500/10'
      case 'debug':
        return 'text-gray-400 bg-gray-500/10'
      default:
        return 'text-gray-400 bg-gray-500/10'
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <ScrollText size={28} className="text-purple-400" />
        原始日志
      </h1>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold">日志列表</h2>
          <button
            onClick={fetchLogs}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            刷新
          </button>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <ScrollText size={48} className="mx-auto mb-2 opacity-50" />
            <p>暂无日志</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700 max-h-[70vh] overflow-auto scrollbar-thin">
            {logs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-gray-700/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(log.severity)}`}>
                        {log.severity}
                      </span>
                      <span className="flex items-center gap-1 text-sm text-gray-400">
                        <Server size={12} />
                        {log.hostname || '-'}
                      </span>
                      <span className="flex items-center gap-1 text-sm text-gray-400">
                        <HardDrive size={12} />
                        {log.source}
                      </span>
                      {log.facility && (
                        <span className="text-sm text-gray-500">[{log.facility}]</span>
                      )}
                    </div>
                    <p className="text-sm font-mono bg-gray-900/50 rounded-lg p-3 overflow-x-auto">
                      {log.message || log.raw}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 whitespace-nowrap">
                    <Clock size={12} />
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
