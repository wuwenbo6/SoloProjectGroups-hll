import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Target, TrendingUp, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const AccuracyPanel: React.FC = () => {
  const { accuracy, resetAccuracy } = useAppStore();

  const formatDeviation = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)} ms`;
  };

  const getDeviationColor = (value: number) => {
    const abs = Math.abs(value);
    if (abs < 10) return 'text-green-400';
    if (abs < 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-400" />
          同步精度分析
        </h3>
        <button
          onClick={resetAccuracy}
          className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700/50"
          title="重置统计"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/50 rounded-lg p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">当前偏差</div>
          <div className={`text-2xl font-bold font-mono ${getDeviationColor(accuracy.deviation)}`}>
            {formatDeviation(accuracy.deviation)}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">平均偏差</div>
          <div className={`text-2xl font-bold font-mono ${getDeviationColor(accuracy.avgDeviation)}`}>
            {formatDeviation(accuracy.avgDeviation)}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">最大偏差</div>
          <div className="text-2xl font-bold font-mono text-red-400">
            {formatDeviation(accuracy.maxDeviation)}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-4 text-center">
          <div className="text-gray-400 text-sm mb-1">标准偏差</div>
          <div className="text-2xl font-bold font-mono text-blue-400">
            {accuracy.stdDeviation.toFixed(2)} ms
          </div>
        </div>
      </div>

      <div className="h-64 bg-gray-900/30 rounded-lg p-4">
        {accuracy.history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={accuracy.history} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="time"
                stroke="#6B7280"
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                tickLine={{ stroke: '#4B5563' }}
              />
              <YAxis
                stroke="#6B7280"
                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                tickLine={{ stroke: '#4B5563' }}
                tickFormatter={(value) => `${value}ms`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F3F4F6',
                }}
                formatter={(value: number) => [`${value.toFixed(2)} ms`, '偏差']}
              />
              <ReferenceLine y={0} stroke="#10B981" strokeDasharray="5 5" />
              <Line
                type="monotone"
                dataKey="deviation"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#3B82F6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <TrendingUp className="w-12 h-12 mb-2 opacity-50" />
            <p>等待数据采集...</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
        <span>采样数: {accuracy.history.length}</span>
        <span>时间偏差 (系统时间 - IRIG-B时间)</span>
      </div>
    </div>
  );
};
