import { ArrowLeft, BarChart3, TrendingUp, Scale, Users } from 'lucide-react';
import { useSimulationStore } from '../store/simulationStore';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';

const algorithmNames: Record<string, string> = {
  fair: '公平调度',
  maxThroughput: '最大吞吐',
  roundRobin: '轮询调度',
};

export default function ComparePanel() {
  const { compareResult, clearCompare } = useSimulationStore();

  if (!compareResult) return null;

  const { algorithm1, algorithm2 } = compareResult;

  const userComparisonData = algorithm1.summary.userThroughputs.map((user1, idx) => {
    const user2 = algorithm2.summary.userThroughputs[idx];
    return {
      name: user1.name,
      [algorithmNames[algorithm1.name]]: user1.avg.toFixed(2),
      [algorithmNames[algorithm2.name]]: user2?.avg.toFixed(2) || 0,
    };
  });

  const radarData = [
    {
      metric: '总吞吐量',
      [algorithmNames[algorithm1.name]]:
        (algorithm1.summary.totalThroughput /
          Math.max(
            algorithm1.summary.totalThroughput,
            algorithm2.summary.totalThroughput
          )) *
        100,
      [algorithmNames[algorithm2.name]]:
        (algorithm2.summary.totalThroughput /
          Math.max(
            algorithm1.summary.totalThroughput,
            algorithm2.summary.totalThroughput
          )) *
        100,
    },
    {
      metric: '公平性指数',
      [algorithmNames[algorithm1.name]]: algorithm1.summary.fairnessIndex * 100,
      [algorithmNames[algorithm2.name]]: algorithm2.summary.fairnessIndex * 100,
    },
    {
      metric: '用户覆盖率',
      [algorithmNames[algorithm1.name]]:
        algorithm1.summary.userThroughputs.filter((u) => u.avg > 0.1).length /
        algorithm1.summary.userThroughputs.length *
        100,
      [algorithmNames[algorithm2.name]]:
        algorithm2.summary.userThroughputs.filter((u) => u.avg > 0.1).length /
        algorithm2.summary.userThroughputs.length *
        100,
    },
    {
      metric: '最差用户吞吐',
      [algorithmNames[algorithm1.name]]:
        (Math.min(...algorithm1.summary.userThroughputs.map((u) => u.avg)) /
          Math.max(
            Math.max(...algorithm1.summary.userThroughputs.map((u) => u.avg)),
            Math.max(...algorithm2.summary.userThroughputs.map((u) => u.avg))
          )) *
        100,
      [algorithmNames[algorithm2.name]]:
        (Math.min(...algorithm2.summary.userThroughputs.map((u) => u.avg)) /
          Math.max(
            Math.max(...algorithm1.summary.userThroughputs.map((u) => u.avg)),
            Math.max(...algorithm2.summary.userThroughputs.map((u) => u.avg))
          )) *
        100,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={clearCompare}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          返回模拟
        </button>
        <h2 className="text-xl font-bold text-white">算法对比分析</h2>
        <div className="w-24" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div
          className="stat-card rounded-xl p-6 border-2"
          style={{ borderColor: '#10b981' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Scale className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {algorithmNames[algorithm1.name]}
              </h3>
              <p className="text-sm text-slate-400">Proportional Fair</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-xs text-slate-400">总吞吐量</span>
              </div>
              <div className="text-xl font-bold text-primary font-mono">
                {algorithm1.summary.totalThroughput.toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">Mbps</div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Scale className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400">公平性</span>
              </div>
              <div className="text-xl font-bold text-emerald-400 font-mono">
                {(algorithm1.summary.fairnessIndex * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">Jain's</div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400">用户吞吐范围</span>
              </div>
              <div className="text-sm font-bold text-amber-400 font-mono">
                {Math.min(...algorithm1.summary.userThroughputs.map((u) => u.avg)).toFixed(1)}
                {' ~ '}
                {Math.max(...algorithm1.summary.userThroughputs.map((u) => u.avg)).toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">Mbps</div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-slate-400">平均吞吐</span>
              </div>
              <div className="text-xl font-bold text-purple-400 font-mono">
                {algorithm1.summary.avgThroughput.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500">Mbps/时隙</div>
            </div>
          </div>
        </div>

        <div
          className="stat-card rounded-xl p-6 border-2"
          style={{ borderColor: '#f97316' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {algorithmNames[algorithm2.name]}
              </h3>
              <p className="text-sm text-slate-400">Max Throughput</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-xs text-slate-400">总吞吐量</span>
              </div>
              <div className="text-xl font-bold text-primary font-mono">
                {algorithm2.summary.totalThroughput.toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">Mbps</div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Scale className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400">公平性</span>
              </div>
              <div className="text-xl font-bold text-emerald-400 font-mono">
                {(algorithm2.summary.fairnessIndex * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">Jain's</div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400">用户吞吐范围</span>
              </div>
              <div className="text-sm font-bold text-amber-400 font-mono">
                {Math.min(...algorithm2.summary.userThroughputs.map((u) => u.avg)).toFixed(1)}
                {' ~ '}
                {Math.max(...algorithm2.summary.userThroughputs.map((u) => u.avg)).toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">Mbps</div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-slate-400">平均吞吐</span>
              </div>
              <div className="text-xl font-bold text-purple-400 font-mono">
                {algorithm2.summary.avgThroughput.toFixed(2)}
              </div>
              <div className="text-xs text-slate-500">Mbps/时隙</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="stat-card rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">用户吞吐量对比</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend />
                <Bar
                  dataKey={algorithmNames[algorithm1.name]}
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey={algorithmNames[algorithm2.name]}
                  fill="#f97316"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="stat-card rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">综合性能雷达图</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis
                  dataKey="metric"
                  stroke="#64748b"
                  fontSize={11}
                />
                <PolarRadiusAxis stroke="#475569" fontSize={9} />
                <Radar
                  name={algorithmNames[algorithm1.name]}
                  dataKey={algorithmNames[algorithm1.name]}
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.3}
                />
                <Radar
                  name={algorithmNames[algorithm2.name]}
                  dataKey={algorithmNames[algorithm2.name]}
                  stroke="#f97316"
                  fill="#f97316"
                  fillOpacity={0.3}
                />
                <Legend />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="stat-card rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">性能差异总结</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary font-mono">
              {(
                ((algorithm1.summary.totalThroughput - algorithm2.summary.totalThroughput) /
                  algorithm2.summary.totalThroughput) *
                100
              ).toFixed(1)}%
            </div>
            <div className="text-xs text-slate-400 mt-1">
              公平调度吞吐差异
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400 font-mono">
              {(
                ((algorithm1.summary.fairnessIndex - algorithm2.summary.fairnessIndex) /
                  algorithm2.summary.fairnessIndex) *
                100
              ).toFixed(1)}%
            </div>
            <div className="text-xs text-slate-400 mt-1">
              公平调度公平性提升
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400 font-mono">
              {(
                ((algorithm2.summary.totalThroughput - algorithm1.summary.totalThroughput) /
                  algorithm1.summary.totalThroughput) *
                100
              ).toFixed(1)}%
            </div>
            <div className="text-xs text-slate-400 mt-1">
              最大吞吐吞吐提升
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400 font-mono">
              {(
                ((algorithm2.summary.fairnessIndex - algorithm1.summary.fairnessIndex) /
                  algorithm1.summary.fairnessIndex) *
                100
              ).toFixed(1)}%
            </div>
            <div className="text-xs text-slate-400 mt-1">
              最大吞吐公平性差异
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
