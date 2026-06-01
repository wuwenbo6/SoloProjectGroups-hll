import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import RoutingTable from './components/RoutingTable'
import StatisticsDashboard from './components/StatisticsDashboard'
import TestPanel from './components/TestPanel'
import { api } from './api/client'
import type { SystemStatus } from './types'

function App() {
  const location = useLocation()
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)

  const fetchSystemStatus = async () => {
    try {
      const res = await api.getStatus()
      if (res.data) {
        setSystemStatus(res.data)
      }
    } catch (err) {
      console.error('Failed to fetch system status:', err)
    }
  }

  useEffect(() => {
    fetchSystemStatus()
    const interval = setInterval(fetchSystemStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const navItems = [
    { path: '/', label: '路由表配置', icon: '🔀' },
    { path: '/stats', label: '转发统计', icon: '📊' },
    { path: '/test', label: '在线测试', icon: '🧪' },
  ]

  const modbusPort = systemStatus?.modbusTcpPort || 502
  const modbusRunning = systemStatus?.modbusTcpRunning ?? true

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-primary-700 to-primary-500 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">⚡</span>
              <div>
                <h1 className="text-xl font-bold">Modbus TCP → RTU 网关</h1>
                <p className="text-sm text-primary-100">透明转发 · 在线测试 · 实时监控</p>
              </div>
            </div>
            <div className="flex items-center space-x-4 text-sm">
              <div className="text-right">
                <div className="text-primary-100 text-xs">Modbus TCP</div>
                <div className="font-mono font-semibold">:{modbusPort}</div>
              </div>
              <div className="text-right">
                <div className="text-primary-100 text-xs">HTTP API</div>
                <div className="font-mono font-semibold">:{systemStatus?.httpPort || 8080}</div>
              </div>
              <div className="flex items-center">
                <span
                  className={`w-2 h-2 rounded-full mr-2 ${
                    modbusRunning ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                  }`}
                />
                <span>{modbusRunning ? '运行中' : '未运行'}</span>
              </div>
            </div>
          </div>
          {modbusPort !== 502 && (
            <div className="mt-2 bg-yellow-500 bg-opacity-20 rounded px-3 py-2 text-xs">
              ⚠️ 端口 502 被占用，已自动换绑到端口 {modbusPort}。请确保 Modbus TCP 客户端连接到正确的端口。
            </div>
          )}
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  location.pathname === item.path
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<RoutingTable />} />
          <Route path="/stats" element={<StatisticsDashboard />} />
          <Route path="/test" element={<TestPanel />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
