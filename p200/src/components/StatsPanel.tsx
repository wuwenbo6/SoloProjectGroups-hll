import React from 'react';
import { MapPin, TrendingUp, TrendingDown, Hash } from 'lucide-react';
import type { StatsData, MetricType } from '../../shared/types';

interface StatsPanelProps {
  stats: StatsData;
  metric: MetricType;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ stats, metric }) => {
  const isRsrp = metric === 'rsrp';
  const mean = isRsrp ? stats.rsrpMean : stats.sinrMean;
  const max = isRsrp ? stats.rsrpMax : stats.sinrMax;
  const min = isRsrp ? stats.rsrpMin : stats.sinrMin;

  const formatValue = (value: number) => {
    return value.toFixed(1) + (isRsrp ? ' dBm' : ' dB');
  };

  return (
    <div className="absolute left-6 top-20 card p-5 z-[1000] w-64">
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Hash className="w-4 h-4 text-accent" />
        统计信息
      </h3>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-accent" />
          </div>
          <div>
            <div className="text-xs text-gray-400">数据点数</div>
            <div className="text-lg font-semibold text-white">
              {stats.pointCount.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-xs text-gray-400">均值</div>
            <div className="text-lg font-semibold text-white">
              {formatValue(mean)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <div className="text-xs text-gray-400">最大值</div>
            <div className="text-lg font-semibold text-green-400">
              {formatValue(max)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <div className="text-xs text-gray-400">最小值</div>
            <div className="text-lg font-semibold text-red-400">
              {formatValue(min)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
