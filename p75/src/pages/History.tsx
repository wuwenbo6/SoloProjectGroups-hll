import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Calendar, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { SensorData } from '../types';

interface ChartData {
  time: string;
  temperature: number;
  pressure: number;
}

export default function History() {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'hour' | 'day' | 'week'>('hour');

  const fetchData = async () => {
    setLoading(true);
    try {
      const limit = timeRange === 'hour' ? 360 : timeRange === 'day' ? 1000 : 1000;
      const historyData = await api.getHistoryData(undefined, undefined, limit);
      
      const chartData = historyData.map((item: SensorData) => ({
        time: new Date(item.timestamp).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        temperature: item.temperature,
        pressure: item.pressure,
      }));
      
      setData(chartData);
    } catch (error) {
      console.error('Failed to fetch history data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">历史趋势</h1>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新数据
        </button>
      </div>

      <div className="flex items-center gap-4">
        <Calendar className="w-5 h-5 text-slate-400" />
        <div className="flex gap-2">
          {([
            { key: 'hour', label: '最近1小时' },
            { key: 'day', label: '最近24小时' },
            { key: 'week', label: '最近7天' },
          ] as const).map((range) => (
            <button
              key={range.key}
              onClick={() => setTimeRange(range.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeRange === range.key
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">温度 & 压力趋势对比</h3>
        <div className="h-96">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="time"
                  stroke="#64748B"
                  fontSize={12}
                  interval="preserveStartEnd"
                  tick={{ fill: '#64748B' }}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#06B6D4"
                  fontSize={12}
                  domain={[0, 100]}
                  tick={{ fill: '#06B6D4' }}
                  label={{ value: '温度 (°C)', angle: -90, position: 'insideLeft', fill: '#06B6D4' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#10B981"
                  fontSize={12}
                  domain={[0, 3]}
                  tick={{ fill: '#10B981' }}
                  label={{ value: '压力 (MPa)', angle: 90, position: 'insideRight', fill: '#10B981' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E293B',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#94A3B8' }}
                />
                <Legend
                  wrapperStyle={{
                    paddingTop: '20px',
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="temperature"
                  name="温度"
                  stroke="#06B6D4"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="pressure"
                  name="压力"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">温度统计</h3>
          {data.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-slate-700/50 rounded-lg">
                <div className="text-slate-400 text-sm mb-1">最小值</div>
                <div className="text-2xl font-bold text-cyan-400 font-mono">
                  {Math.min(...data.map((d) => d.temperature)).toFixed(1)}°C
                </div>
              </div>
              <div className="text-center p-4 bg-slate-700/50 rounded-lg">
                <div className="text-slate-400 text-sm mb-1">最大值</div>
                <div className="text-2xl font-bold text-red-400 font-mono">
                  {Math.max(...data.map((d) => d.temperature)).toFixed(1)}°C
                </div>
              </div>
              <div className="text-center p-4 bg-slate-700/50 rounded-lg">
                <div className="text-slate-400 text-sm mb-1">平均值</div>
                <div className="text-2xl font-bold text-yellow-400 font-mono">
                  {(data.reduce((sum, d) => sum + d.temperature, 0) / data.length).toFixed(1)}°C
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">压力统计</h3>
          {data.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-slate-700/50 rounded-lg">
                <div className="text-slate-400 text-sm mb-1">最小值</div>
                <div className="text-2xl font-bold text-cyan-400 font-mono">
                  {Math.min(...data.map((d) => d.pressure)).toFixed(2)} MPa
                </div>
              </div>
              <div className="text-center p-4 bg-slate-700/50 rounded-lg">
                <div className="text-slate-400 text-sm mb-1">最大值</div>
                <div className="text-2xl font-bold text-red-400 font-mono">
                  {Math.max(...data.map((d) => d.pressure)).toFixed(2)} MPa
                </div>
              </div>
              <div className="text-center p-4 bg-slate-700/50 rounded-lg">
                <div className="text-slate-400 text-sm mb-1">平均值</div>
                <div className="text-2xl font-bold text-yellow-400 font-mono">
                  {(data.reduce((sum, d) => sum + d.pressure, 0) / data.length).toFixed(2)} MPa
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">数据记录</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="py-3 px-4 text-slate-400 font-medium">时间</th>
                <th className="py-3 px-4 text-slate-400 font-medium">温度 (°C)</th>
                <th className="py-3 px-4 text-slate-400 font-medium">压力 (MPa)</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(-10).reverse().map((item, index) => (
                <tr key={index} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="py-3 px-4 text-slate-300 font-mono text-sm">{item.time}</td>
                  <td className="py-3 px-4 text-cyan-400 font-mono">{item.temperature.toFixed(2)}</td>
                  <td className="py-3 px-4 text-green-400 font-mono">{item.pressure.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
