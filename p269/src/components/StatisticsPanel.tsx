import React from 'react';
import { useDmrStore } from '@/store/useDmrStore';
import { CALL_TYPE_LABELS, CALL_TYPE_COLORS } from '@/types';
import { formatDuration } from '@/utils/format';
import type { CallType } from '@/types';
import { Phone, Users, Clock, Radio } from 'lucide-react';

export const StatisticsPanel: React.FC = () => {
  const { result } = useDmrStore();

  if (!result) {
    return (
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">呼叫统计</h2>
        <div className="h-32 flex items-center justify-center text-gray-500">
          分析完成后显示统计信息
        </div>
      </div>
    );
  }

  const { callStatistics } = result;

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
      <h2 className="text-lg font-semibold text-gray-200 mb-4">呼叫统计</h2>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<Radio className="w-5 h-5" />}
          label="总呼叫数"
          value={callStatistics.totalCalls.toString()}
          color="#00d4ff"
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="时隙 1"
          value={callStatistics.bySlot[1].toString()}
          color="#00ff88"
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="时隙 2"
          value={callStatistics.bySlot[2].toString()}
          color="#ffd700"
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="总时长"
          value={formatDuration(callStatistics.totalDuration)}
          color="#ff6b35"
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400">按类型分布</h3>
        <div className="space-y-2">
          {(Object.keys(CALL_TYPE_LABELS) as CallType[]).map((type) => {
            const count = callStatistics.byType[type];
            const percentage = callStatistics.totalCalls > 0
              ? (count / callStatistics.totalCalls) * 100
              : 0;

            return (
              <div key={type} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: CALL_TYPE_COLORS[type] }}
                    />
                    <span className="text-gray-400">{CALL_TYPE_LABELS[type]}</span>
                  </div>
                  <span className="font-mono text-gray-300">
                    {count} ({percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: CALL_TYPE_COLORS[type],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, color }) => {
  return (
    <div className="bg-gray-700/30 rounded-lg p-3 border border-gray-700/50">
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div
        className="text-xl font-mono font-bold"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
};
