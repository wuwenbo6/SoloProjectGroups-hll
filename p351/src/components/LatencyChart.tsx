import { useEffect, useState } from 'react';
import { Clock, Download, TrendingUp, BarChart3 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useSimStore } from '@/store/useSimStore';
import type { LatencyTrendPoint } from '@/types';

export default function LatencyChart() {
  const { state, latencyStats, exportLatency } = useSimStore();
  const [trendData, setTrendData] = useState<LatencyTrendPoint[]>([]);

  useEffect(() => {
    const fetchTrend = async () => {
      try {
        const res = await fetch('/api/latency?window=5');
        const data = await res.json();
        setTrendData(data.trend || []);
      } catch {
        // ignore
      }
    };

    fetchTrend();
    const interval = setInterval(fetchTrend, 2000);
    return () => clearInterval(interval);
  }, [state?.is_running]);

  const stats = state?.latency_stats || latencyStats || {
    count: 0,
    avg_ms: 0,
    min_ms: 0,
    max_ms: 0,
    p50_ms: 0,
    p95_ms: 0,
    p99_ms: 0,
  };

  const chartData = trendData.map((point, i) => ({
    name: `W${i + 1}`,
    avg: point.avg_ms,
    count: point.count,
  }));

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    } as Intl.DateTimeFormatOptions);
  };

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header">
        <h2 className="card-title">
          <Clock className="w-5 h-5 text-blue-400" />
          复制延迟趋势
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportLatency('csv')}
            className="text-xs px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 flex items-center gap-1 transition-colors"
            title="导出CSV"
          >
            <Download className="w-3 h-3" /> CSV
          </button>
          <button
            onClick={() => exportLatency('json')}
            className="text-xs px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 flex items-center gap-1 transition-colors"
            title="导出JSON"
          >
            <Download className="w-3 h-3" /> JSON
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3 flex-1 overflow-y-auto">
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
            <div className="text-[10px] text-slate-500">平均</div>
            <div className="text-sm font-mono font-bold text-blue-400">{stats.avg_ms.toFixed(1)}ms</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
            <div className="text-[10px] text-slate-500">P50</div>
            <div className="text-sm font-mono font-bold text-emerald-400">{stats.p50_ms.toFixed(1)}ms</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
            <div className="text-[10px] text-slate-500">P95</div>
            <div className="text-sm font-mono font-bold text-amber-400">{stats.p95_ms.toFixed(1)}ms</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
            <div className="text-[10px] text-slate-500">P99</div>
            <div className="text-sm font-mono font-bold text-rose-400">{stats.p99_ms.toFixed(1)}ms</div>
          </div>
        </div>

        <div className="h-40">
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#336791" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#336791" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="ms" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                  formatter={(value: number) => [`${value.toFixed(2)}ms`, '平均延迟']}
                />
                <Area
                  type="monotone"
                  dataKey="avg"
                  stroke="#336791"
                  fill="url(#latencyGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              <div className="text-center">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p>需要更多数据点来绘制趋势图</p>
                <p className="text-xs mt-1">开始自动模拟以生成延迟数据</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1 text-slate-400">
            <BarChart3 className="w-3 h-3" />
            <span>事件数: {stats.count}</span>
          </div>
          <div className="text-slate-400">
            Min: {stats.min_ms.toFixed(1)}ms
          </div>
          <div className="text-slate-400">
            Max: {stats.max_ms.toFixed(1)}ms
          </div>
        </div>
      </div>
    </div>
  );
}
