import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Thermometer, Gauge, Activity, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { wsService } from '../services/websocket';
import { SensorData, PlcStatus } from '../types';

interface ChartData extends SensorData {
  time: string;
}

export default function Dashboard() {
  const [currentData, setCurrentData] = useState<SensorData | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [plcStatus, setPlcStatus] = useState<PlcStatus>({ connected: false });

  useEffect(() => {
    wsService.connect();

    const unsubscribeData = wsService.onDataUpdate((data) => {
      setCurrentData(data);

      const time = new Date(data.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setChartData((prev) => {
        const newData = [...prev, { ...data, time }];
        if (newData.length > 60) {
          return newData.slice(-60);
        }
        return newData;
      });
    });

    const unsubscribeStatus = wsService.onPlcStatus((status) => {
      setPlcStatus(status);
    });

    return () => {
      unsubscribeData();
      unsubscribeStatus();
    };
  }, []);

  const getStatusColor = (value: number, type: 'temp' | 'pressure') => {
    if (type === 'temp') {
      if (value > 70) return 'text-red-500';
      if (value > 60) return 'text-yellow-500';
      return 'text-cyan-400';
    } else {
      if (value > 2.0) return 'text-red-500';
      if (value > 1.8) return 'text-yellow-500';
      return 'text-cyan-400';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">工业监控仪表盘</h1>
        <div className="flex items-center gap-2">
          {plcStatus.connected ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-900/30 border border-green-500/50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-green-400 text-sm font-medium">PLC 已连接</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-900/30 border border-red-500/50 rounded-lg">
              <XCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-400 text-sm font-medium">PLC 未连接</span>
            </div>
          )}
        </div>
      </div>

      {currentData?.alarm && (
        <div className="flex items-center gap-3 p-4 bg-red-900/30 border border-red-500/50 rounded-lg animate-pulse">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <span className="text-red-400 font-medium">告警：设备参数超出正常范围！</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-cyan-500/20 rounded-lg">
                <Thermometer className="w-6 h-6 text-cyan-400" />
              </div>
              <span className="text-slate-400">温度</span>
            </div>
            <Activity className="w-5 h-5 text-slate-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-bold font-mono ${getStatusColor(currentData?.temperature || 0, 'temp')}`}>
              {currentData?.temperature.toFixed(2) || '--'}
            </span>
            <span className="text-slate-400 text-lg">°C</span>
          </div>
          <div className="mt-4 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${currentData && currentData.temperature > 70 ? 'bg-red-500' : 'bg-cyan-400'}`}
              style={{ width: `${Math.min(((currentData?.temperature || 0) / 100) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-cyan-500/20 rounded-lg">
                <Gauge className="w-6 h-6 text-cyan-400" />
              </div>
              <span className="text-slate-400">压力</span>
            </div>
            <Activity className="w-5 h-5 text-slate-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-bold font-mono ${getStatusColor(currentData?.pressure || 0, 'pressure')}`}>
              {currentData?.pressure.toFixed(3) || '--'}
            </span>
            <span className="text-slate-400 text-lg">MPa</span>
          </div>
          <div className="mt-4 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${currentData && currentData.pressure > 2.0 ? 'bg-red-500' : 'bg-cyan-400'}`}
              style={{ width: `${Math.min(((currentData?.pressure || 0) / 3) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${currentData?.status ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                <Activity className={`w-6 h-6 ${currentData?.status ? 'text-green-400' : 'text-red-400'}`} />
              </div>
              <span className="text-slate-400">设备状态</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-bold ${currentData?.status ? 'text-green-400' : 'text-red-400'}`}>
              {currentData?.status ? '运行中' : '停止'}
            </span>
          </div>
          <div className="mt-4 text-slate-500 text-sm">
            最后更新: {currentData ? new Date(currentData.timestamp).toLocaleString('zh-CN') : '--'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">温度趋势</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#64748B" fontSize={12} />
                <YAxis stroke="#64748B" fontSize={12} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94A3B8' }}
                />
                <Area type="monotone" dataKey="temperature" stroke="#06B6D4" strokeWidth={2} fill="url(#tempGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">压力趋势</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="pressGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#64748B" fontSize={12} />
                <YAxis stroke="#64748B" fontSize={12} domain={[0, 3]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94A3B8' }}
                />
                <Area type="monotone" dataKey="pressure" stroke="#10B981" strokeWidth={2} fill="url(#pressGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
