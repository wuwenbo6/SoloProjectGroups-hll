import { BarChart3, TrendingUp, Users, Scale, Battery, Wifi } from 'lucide-react';
import { useSimulationStore } from '../store/simulationStore';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { USER_COLORS, getUserName, BSS_COLORS, getBSSName } from '@shared/types';

export default function StatisticsPanel() {
  const { summary, slotResults, config } = useSimulationStore();

  const throughputHistory = slotResults.slice(-50).map((slot, idx) => ({
    slot: slotResults.length > 50 ? slotResults.length - 50 + idx + 1 : idx + 1,
    throughput: slot.totalThroughput,
  }));

  const userThroughputData = summary?.userThroughputs.map((user) => ({
    name: getUserName(user.userId),
    吞吐量: user.avg.toFixed(2),
    fill: USER_COLORS[user.userId % USER_COLORS.length],
  })) || [];

  return (
    <div className="config-panel rounded-xl border border-slate-700 p-4 space-y-4 h-full max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-700">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-white">统计数据</h2>
      </div>

      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="stat-card rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-xs text-slate-400">总吞吐量</span>
              </div>
              <div className="text-xl font-bold text-primary font-mono">
                {summary.totalThroughput.toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">Mbps</div>
            </div>

            <div className="stat-card rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Scale className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400">公平性</span>
              </div>
              <div className="text-xl font-bold text-emerald-400 font-mono">
                {(summary.fairnessIndex * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">Jain's Index</div>
            </div>

            <div className="stat-card rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400">用户数</span>
              </div>
              <div className="text-xl font-bold text-amber-400 font-mono">
                {config.numUsers}
              </div>
              <div className="text-xs text-slate-500">活跃用户</div>
            </div>

            <div className="stat-card rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-slate-400">平均吞吐</span>
              </div>
              <div className="text-xl font-bold text-purple-400 font-mono">
                {summary.avgThroughput.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500">Mbps/时隙</div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">吞吐量趋势</h3>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={throughputHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="slot"
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="throughput"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">用户平均吞吐量</h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userThroughputData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    type="number"
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar
                    dataKey="吞吐量"
                    radius={[0, 4, 4, 0]}
                    fill="#0ea5e9"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">用户详情</h3>
            <div className="space-y-2">
              {summary.userThroughputs
                .sort((a, b) => b.total - a.total)
                .map((user) => (
                  <div key={user.userId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: USER_COLORS[user.userId % USER_COLORS.length] }}
                        />
                        <span className="text-slate-300">{user.name}</span>
                      </div>
                      <span className="text-white font-mono">{user.total.toFixed(1)} Mbps</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(user.total / summary.totalThroughput) * 100}%`,
                          backgroundColor: USER_COLORS[user.userId % USER_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {config.enablePowerSave && summary.powerSaveStats && (
            <div className="pt-4 border-t border-slate-700">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-3">
                <Battery className="w-4 h-4 text-emerald-400" />
                节电管理统计
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="stat-card rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">节省电量</div>
                  <div className="text-lg font-bold text-emerald-400 font-mono">
                    {summary.powerSaveStats.energySaved.toFixed(1)}%
                  </div>
                </div>
                <div className="stat-card rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">平均休眠率</div>
                  <div className="text-lg font-bold text-emerald-400 font-mono">
                    {(summary.powerSaveStats.avgSleepRatio * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {config.enableBSSColoring && summary.bssSummary && summary.bssSummary.length > 0 && (
            <div className="pt-4 border-t border-slate-700">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-3">
                <Wifi className="w-4 h-4 text-blue-400" />
                BSS统计
              </h3>
              <div className="space-y-2">
                {summary.bssSummary.map((bss) => (
                  <div key={bss.bssId} className="stat-card rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: BSS_COLORS[bss.bssId % BSS_COLORS.length] }}
                        />
                        <span className="text-sm text-slate-300">{getBSSName(bss.bssId)}</span>
                      </div>
                      <span className="text-xs text-blue-400">
                        干扰减少: {bss.interferenceReduction.toFixed(1)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400">总吞吐: </span>
                        <span className="text-white font-mono">{bss.totalThroughput.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">SR吞吐: </span>
                        <span className="text-blue-400 font-mono">{bss.srThroughput.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="py-12 text-center text-slate-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">暂无统计数据</p>
          <p className="text-xs">开始模拟后将显示统计信息</p>
        </div>
      )}
    </div>
  );
}
