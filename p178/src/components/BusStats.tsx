import { Activity, TrendingUp, AlertTriangle, CheckCircle, XCircle, Gauge } from 'lucide-react';
import type { BusStatistics } from '../types/bus';
import { cn } from '../lib/utils';

interface BusStatsProps {
  statistics: BusStatistics | null;
}

export default function BusStats({ statistics }: BusStatsProps) {
  if (!statistics) {
    return (
      <div className="p-4 rounded-lg border border-[#1a2332] bg-[#0f1623]">
        <h2 className="text-lg font-semibold text-[#00d4ff] mb-4">总线统计</h2>
        <div className="flex items-center justify-center h-32 text-[#3a4556] text-sm">
          暂无统计数据，开始模拟后将显示总线利用率
        </div>
      </div>
    );
  }

  const getUtilizationColor = (util: number) => {
    if (util < 30) return 'text-[#10b981]';
    if (util < 70) return 'text-[#f59e0b]';
    return 'text-[#ef4444]';
  };

  const getUtilizationBg = (util: number) => {
    if (util < 30) return 'bg-[#10b981]';
    if (util < 70) return 'bg-[#f59e0b]';
    return 'bg-[#ef4444]';
  };

  return (
    <div className="p-4 rounded-lg border border-[#1a2332] bg-[#0f1623]">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="text-[#00d4ff]" size={18} />
        <h2 className="text-lg font-semibold text-[#00d4ff]">总线统计</h2>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#8899aa]">总线利用率</span>
            <span className={cn('text-xl font-bold', getUtilizationColor(statistics.utilization))}>
              {statistics.utilization}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#1a2332] overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', getUtilizationBg(statistics.utilization))}
              style={{ width: `${statistics.utilization}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-[#0a0e17] border border-[#1a2332]">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} className="text-[#00d4ff]" />
              <span className="text-xs text-[#667788]">总位数</span>
            </div>
            <div className="text-lg font-bold text-[#e0e6ed]">{statistics.totalBits}</div>
          </div>

          <div className="p-3 rounded-lg bg-[#0a0e17] border border-[#1a2332]">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-[#10b981]" />
              <span className="text-xs text-[#667788]">活跃位</span>
            </div>
            <div className="text-lg font-bold text-[#10b981]">{statistics.activeBits}</div>
          </div>

          <div className="p-3 rounded-lg bg-[#0a0e17] border border-[#1a2332]">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} className="text-[#667788]" />
              <span className="text-xs text-[#667788]">空闲位</span>
            </div>
            <div className="text-lg font-bold text-[#667788]">{statistics.idleBits}</div>
          </div>

          <div className="p-3 rounded-lg bg-[#0a0e17] border border-[#1a2332]">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-[#ef4444]" />
              <span className="text-xs text-[#667788]">冲突位</span>
            </div>
            <div className="text-lg font-bold text-[#ef4444]">{statistics.collisionBits}</div>
          </div>
        </div>

        <div className="pt-2 border-t border-[#1a2332]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#8899aa]">帧统计</span>
            <span className="text-xs text-[#667788]">平均: {statistics.averageFrameSize} bit/帧</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded bg-[#0a0e17] text-center">
              <div className="text-sm font-bold text-[#e0e6ed]">{statistics.totalFrames}</div>
              <div className="text-xs text-[#667788]">总计</div>
            </div>
            <div className="p-2 rounded bg-[#0a0e17] text-center">
              <div className="text-sm font-bold text-[#10b981]">
                <CheckCircle size={12} className="inline mr-1" />
                {statistics.successfulFrames}
              </div>
              <div className="text-xs text-[#667788]">成功</div>
            </div>
            <div className="p-2 rounded bg-[#0a0e17] text-center">
              <div className="text-sm font-bold text-[#ef4444]">
                <XCircle size={12} className="inline mr-1" />
                {statistics.failedFrames}
              </div>
              <div className="text-xs text-[#667788]">失败</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
