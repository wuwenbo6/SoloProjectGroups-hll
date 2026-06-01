import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  AlertTriangle, Activity, FileCode, ScrollText, 
  Play, RefreshCw, CheckCircle, Clock
} from 'lucide-react'
import axios from 'axios'

export default function Dashboard({ newAlerts }) {
  const [stats, setStats] = useState({
    alerts: 0,
    events: 0,
    rules: 0,
    logs: 0
  })
  const [recentAlerts, setRecentAlerts] = useState([])
  const [simulating, setSimulating] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (newAlerts.length > 0) {
      setRecentAlerts(prev => [...newAlerts, ...prev].slice(0, 10))
      setStats(prev => ({ ...prev, alerts: prev.alerts + newAlerts.length }))
    }
  }, [newAlerts])

  const fetchData = async () => {
    try {
      const [alertsRes, eventsRes, rulesRes, logsRes] = await Promise.all([
        axios.get('/api/alerts'),
        axios.get('/api/events'),
        axios.get('/api/rules'),
        axios.get('/api/logs')
      ])
      
      setStats({
        alerts: alertsRes.data.data?.length || 0,
        events: eventsRes.data.data?.length || 0,
        rules: rulesRes.data.data?.length || 0,
        logs: logsRes.data.data?.length || 0
      })
      
      setRecentAlerts(alertsRes.data.data?.slice(0, 10) || [])
    } catch (err) {
      console.error('Failed to fetch data:', err)
    }
  }

  const simulateBruteForce = async () => {
    setSimulating(true)
    try {
      await axios.post('/api/simulate/brute-force', { count: 5 })
      setTimeout(fetchData, 1000)
    } catch (err) {
      console.error('Simulation failed:', err)
    }
    setSimulating(false)
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'bg-red-500'
      case 'medium': return 'bg-yellow-500'
      case 'low': return 'bg-green-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'new': return 'text-red-400'
      case 'acknowledged': return 'text-yellow-400'
      case 'resolved': return 'text-green-400'
      default: return 'text-gray-400'
    }
  }

  const statCards = [
    { label: '告警总数', value: stats.alerts, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: '事件总数', value: stats.events, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: '规则数量', value: stats.rules, icon: FileCode, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: '日志总数', value: stats.logs, icon: ScrollText, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <div className="flex gap-2">
          <button
            onClick={simulateBruteForce}
            disabled={simulating}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            <Play size={16} />
            {simulating ? '模拟中...' : '模拟暴力破解攻击'}
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card, i) => {
          const Icon = card.icon
          return (
            <div key={i} className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">{card.label}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${card.bg}`}>
                  <Icon size={24} className={card.color} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-400" />
            最近告警
          </h2>
          
          {recentAlerts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle size={48} className="mx-auto mb-2 opacity-50" />
              <p>暂无告警</p>
              <p className="text-sm">点击"模拟暴力破解攻击"测试规则引擎</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-auto scrollbar-thin">
              {recentAlerts.map((alert) => (
                <Link
                  key={alert.id}
                  to="/alerts"
                  className="block p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${getSeverityColor(alert.severity)}`}></span>
                        <span className="font-medium">{alert.rule_name}</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{alert.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(alert.timestamp).toLocaleString()}
                        </span>
                        <span className={getStatusColor(alert.status)}>
                          {alert.status === 'new' ? '新告警' : alert.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileCode size={20} className="text-green-400" />
            内置规则说明
          </h2>
          
          <div className="space-y-4">
            <div className="p-4 bg-gray-700/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="font-medium">暴力破解检测</span>
              </div>
              <p className="text-sm text-gray-400">
                检测多次登录失败后成功登录的模式，可能表示密码被成功猜测。
              </p>
              <div className="mt-2 text-xs text-gray-500">
                <span className="bg-gray-600 px-2 py-1 rounded">sequence</span>
                <span className="mx-2">5分钟时间窗口</span>
              </div>
            </div>

            <div className="p-4 bg-gray-700/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                <span className="font-medium">多次登录失败</span>
              </div>
              <p className="text-sm text-gray-400">
                检测同一用户在5分钟内超过5次登录失败，可能表示暴力破解尝试。
              </p>
              <div className="mt-2 text-xs text-gray-500">
                <span className="bg-gray-600 px-2 py-1 rounded">count</span>
                <span className="mx-2">5分钟时间窗口</span>
              </div>
            </div>

            <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-blue-400" />
                <span className="font-medium text-blue-400">支持自定义规则</span>
              </div>
              <p className="text-sm text-gray-400">
                前往"规则"页面创建和管理自定义检测规则，支持 JavaScript 条件表达式。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
