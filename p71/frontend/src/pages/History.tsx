import React, { useEffect } from 'react'
import { useHistoryStore } from '../store/trainingStore'
import { ACTION_NAMES } from '../types/pose'
import { ReportExport } from '../components/ReportExport'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

export const History: React.FC = () => {
  const { sessions, isLoading, fetchSessions, deleteSession } = useHistoryStore()

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`
  }

  const chartData = sessions.slice(0, 7).map(session => ({
    date: formatDate(session.startTime).split(' ')[0],
    calories: Math.round(session.totalCalories * 10) / 10,
    actions: session.actions.reduce((sum, a) => sum + a.count, 0)
  })).reverse()

  const actionStats = sessions.reduce((acc, session) => {
    session.actions.forEach(action => {
      if (!acc[action.actionName]) {
        acc[action.actionName] = 0
      }
      acc[action.actionName] += action.count
    })
    return acc
  }, {} as Record<string, number>)

  const statsChartData = Object.entries(actionStats).map(([name, count]) => ({
    name: ACTION_NAMES[name] || name,
    count
  }))

  const totalCalories = sessions.reduce((sum, s) => sum + s.totalCalories, 0)
  const totalActions = sessions.reduce((sum, s) => sum + s.actions.reduce((a, b) => a + b.count, 0), 0)

  if (isLoading && sessions.length === 0) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-neon-cyan border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen grid-bg">
      <header className="px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-orange to-neon-pink flex items-center justify-center text-2xl">
            📊
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">训练历史</h1>
            <p className="text-gray-400 text-sm">查看您的训练记录和统计数据</p>
          </div>
        </div>
        <ReportExport />
      </header>

      <main className="px-8 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="glass rounded-2xl p-5">
            <p className="text-gray-400 text-sm">总训练次数</p>
            <p className="text-3xl font-bold font-mono text-neon-cyan mt-2">{sessions.length}</p>
            <p className="text-gray-500 text-xs mt-1">次训练</p>
          </div>
          <div className="glass rounded-2xl p-5">
            <p className="text-gray-400 text-sm">总动作数</p>
            <p className="text-3xl font-bold font-mono text-neon-green mt-2">{totalActions}</p>
            <p className="text-gray-500 text-xs mt-1">个动作</p>
          </div>
          <div className="glass rounded-2xl p-5">
            <p className="text-gray-400 text-sm">消耗热量</p>
            <p className="text-3xl font-bold font-mono text-neon-orange mt-2">{Math.round(totalCalories)}</p>
            <p className="text-gray-500 text-xs mt-1">千卡</p>
          </div>
          <div className="glass rounded-2xl p-5">
            <p className="text-gray-400 text-sm">训练时长</p>
            <p className="text-3xl font-bold font-mono text-neon-pink mt-2">
              {Math.round(sessions.reduce((sum, s) => sum + s.duration, 0) / 60)}
            </p>
            <p className="text-gray-500 text-xs mt-1">分钟</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="glass rounded-2xl p-6">
            <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-4">热量消耗趋势</h3>
            <div className="h-64">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#94A3B8" fontSize={12} />
                    <YAxis stroke="#94A3B8" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        border: '1px solid #334155',
                        borderRadius: '8px'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="calories"
                      stroke="#06B6D4"
                      strokeWidth={2}
                      dot={{ fill: '#06B6D4' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  暂无数据
                </div>
              )}
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-4">动作分布</h3>
            <div className="h-64">
              {statsChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
                    <YAxis stroke="#94A3B8" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        border: '1px solid #334155',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="count" fill="#EC4899" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  暂无数据
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-4">训练记录</h3>
          
          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📝</div>
              <p className="text-gray-400">暂无训练记录</p>
              <p className="text-gray-500 text-sm mt-2">开始您的第一次训练吧！</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 bg-dark-bg rounded-xl hover:bg-slate-800/50 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-green/20 flex items-center justify-center text-xl">
                      📅
                    </div>
                    <div>
                      <p className="text-white font-medium">{formatDate(session.startTime)}</p>
                      <p className="text-gray-500 text-sm">
                        时长 {formatDuration(session.duration)} · {session.actions.length} 种动作
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="flex gap-4">
                      {session.actions.map((action, idx) => (
                        <div key={idx} className="text-center">
                          <p className="text-xl font-bold font-mono text-neon-cyan">
                            {action.count}
                          </p>
                          <p className="text-gray-500 text-xs">
                            {ACTION_NAMES[action.actionName] || action.actionName}
                          </p>
                        </div>
                      ))}
                    </div>
                    
                    <div className="text-right">
                      <p className="text-neon-orange font-mono font-bold">
                        {Math.round(session.totalCalories * 10) / 10} kcal
                      </p>
                    </div>
                    
                    <button
                      onClick={() => deleteSession(session.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-all"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
