import { useState, useEffect, useRef } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { api } from '../api/client'
import type { Route, RouteStats } from '../types'

export default function StatisticsDashboard() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [stats, setStats] = useState<Record<string, RouteStats>>({})
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting')
  const wsRef = useRef<WebSocket | null>(null)

  const fetchData = async () => {
    try {
      const [routesRes, statsRes] = await Promise.all([
        api.getRoutes(),
        api.getStats().catch(() => ({ data: {} })),
      ])
      setRoutes(routesRes.data || [])
      setStats(statsRes.data || {})
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchData()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`

    const connectWs = () => {
      setWsStatus('connecting')
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => setWsStatus('connected')
      ws.onclose = () => {
        setWsStatus('disconnected')
        setTimeout(connectWs, 3000)
      }
      ws.onerror = () => {
        setWsStatus('disconnected')
      }
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setStats(data)
        } catch {
          // ignore parse errors
        }
      }
    }

    connectWs()

    const interval = setInterval(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        fetchData()
      }
    }, 5000)

    return () => {
      wsRef.current?.close()
      clearInterval(interval)
    }
  }, [])

  const handleReset = async (routeId: number) => {
    if (!confirm('确定重置此路由的统计数据?')) return
    try {
      await api.resetRouteStats(routeId)
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const chartData = routes.map((route) => {
    const s = stats[String(route.id)]
    return {
      name: route.ipAddress,
      发送: s?.PacketsSent || 0,
      接收: s?.PacketsReceived || 0,
      错误: s?.Errors || 0,
    }
  })

  const COLORS = ['#0EA5E9', '#10B981', '#EF4444']

  const totalSent = Object.values(stats).reduce((sum, s) => sum + (s?.PacketsSent || 0), 0)
  const totalReceived = Object.values(stats).reduce((sum, s) => sum + (s?.PacketsReceived || 0), 0)
  const totalErrors = Object.values(stats).reduce((sum, s) => sum + (s?.Errors || 0), 0)
  const totalBytesSent = Object.values(stats).reduce((sum, s) => sum + (s?.BytesSent || 0), 0)
  const totalBytesReceived = Object.values(stats).reduce((sum, s) => sum + (s?.BytesReceived || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">转发统计</h2>
          <p className="text-sm text-gray-500 mt-1">
            实时监控 Modbus TCP ↔ RTU 转发数据
            <span
              className={`ml-2 inline-flex items-center text-xs ${
                wsStatus === 'connected'
                  ? 'text-green-600'
                  : wsStatus === 'connecting'
                  ? 'text-yellow-600'
                  : 'text-red-600'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full mr-1 ${
                  wsStatus === 'connected'
                    ? 'bg-green-500'
                    : wsStatus === 'connecting'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
              />
              {wsStatus === 'connected' ? '实时推送' : wsStatus === 'connecting' ? '连接中...' : '已断开'}
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="text-sm text-gray-500">总发送包数</div>
          <div className="text-2xl font-bold text-primary-600 mt-1">{totalSent.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">总接收包数</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{totalReceived.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">总发送字节</div>
          <div className="text-2xl font-bold text-blue-500 mt-1">{formatBytes(totalBytesSent)}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">总接收字节</div>
          <div className="text-2xl font-bold text-teal-600 mt-1">{formatBytes(totalBytesReceived)}</div>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">收发包数对比</h3>
        <div className="h-64">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="发送" stackId="a">
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[0]} />
                  ))}
                </Bar>
                <Bar dataKey="接收" stackId="a">
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[1]} />
                  ))}
                </Bar>
                <Bar dataKey="错误">
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[2]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">暂无数据</div>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">详细统计</h3>
        <table>
          <thead>
            <tr>
              <th>路由</th>
              <th>IP</th>
              <th>发送包数</th>
              <th>接收包数</th>
              <th>发送字节</th>
              <th>接收字节</th>
              <th>错误数</th>
              <th>超时</th>
              <th>最近活动</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {routes.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-gray-400">
                  暂无路由配置
                </td>
              </tr>
            )}
            {routes.map((route) => {
              const s = stats[String(route.id)]
              const unitTimeouts = s?.UnitTimeouts || {}
              const totalTimeouts = Object.values(unitTimeouts).reduce((sum, u) => sum + (u?.timeoutCount || 0), 0)
              return (
                <tr key={route.id}>
                  <td className="font-mono">#{route.id}</td>
                  <td className="font-mono text-primary-600">{route.ipAddress}</td>
                  <td>{(s?.PacketsSent || 0).toLocaleString()}</td>
                  <td>{(s?.PacketsReceived || 0).toLocaleString()}</td>
                  <td>{formatBytes(s?.BytesSent || 0)}</td>
                  <td>{formatBytes(s?.BytesReceived || 0)}</td>
                  <td>
                    <span className={`${(s?.Errors || 0) > 0 ? 'text-red-500 font-semibold' : ''}`}>
                      {s?.Errors || 0}
                    </span>
                  </td>
                  <td>
                    {totalTimeouts > 0 ? (
                      <span className="text-orange-500 font-semibold">{totalTimeouts}</span>
                    ) : (
                      <span>0</span>
                    )}
                  </td>
                  <td>{s?.LastActivity ? new Date(s.LastActivity).toLocaleString() : '-'}</td>
                  <td>
                    <button
                      onClick={() => handleReset(route.id)}
                      className="text-gray-500 hover:text-red-500 text-sm"
                    >
                      重置
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {totalErrors > 0 && (
          <div className="mt-4 text-sm text-red-500">
            ⚠ 检测到 {totalErrors} 个错误，请检查串口连接和从站设备状态
          </div>
        )}
      </div>

      {routes.some((r) => {
        const s = stats[String(r.id)]
        const unitTimeouts = s?.UnitTimeouts || {}
        return Object.keys(unitTimeouts).length > 0
      }) && (
        <div className="card mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">请求超时统计（按单元ID）</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {routes.map((route) => {
              const s = stats[String(route.id)]
              const unitTimeouts = s?.UnitTimeouts || {}
              if (Object.keys(unitTimeouts).length === 0) return null
              return (
                <div key={route.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      路由 #{route.id} {route.ipAddress}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(unitTimeouts).map(([unitId, data]) => {
                      const timeoutRate = data.totalCount > 0 ? ((data.timeoutCount / data.totalCount) * 100).toFixed(1) : '0'
                      return (
                        <div key={unitId} className="flex items-center justify-between text-sm">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">ID: {unitId}</span>
                            <span className="text-gray-500">{data.totalCount} 请求</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-orange-500 font-semibold">{data.timeoutCount} 超时</span>
                            <span className={`text-xs ${Number(timeoutRate) > 10 ? 'text-red-500' : 'text-gray-400'}`}>
                              {timeoutRate}%
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
