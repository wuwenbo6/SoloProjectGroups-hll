import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { formatLat, formatLon, toDeg } from '@/utils/coordinate';
import { Navigation, MapPin, Compass, Activity, AlertCircle, Signal, SignalZero } from 'lucide-react';
import { TrajectoryMessage } from '@/types';

function ConfidenceBar({ value, level }: { value: number; level: string }) {
  const pct = Math.round(value * 100);
  const colorMap: Record<string, string> = {
    high: 'bg-green-400',
    good: 'bg-accent',
    moderate: 'bg-yellow-400',
    degraded: 'bg-orange-400',
    low: 'bg-red-400',
    critical: 'bg-red-600',
    unknown: 'bg-text-dim',
  };
  const color = colorMap[level] || 'bg-text-dim';
  const textColorMap: Record<string, string> = {
    high: 'text-green-400',
    good: 'text-accent',
    moderate: 'text-yellow-400',
    degraded: 'text-orange-400',
    low: 'text-red-400',
    critical: 'text-red-600',
    unknown: 'text-text-dim',
  };
  const textColor = textColorMap[level] || 'text-text-dim';
  const labelMap: Record<string, string> = {
    high: '高',
    good: '良好',
    moderate: '中等',
    degraded: '降级',
    low: '低',
    critical: '严重',
    unknown: '未知',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-text-dim">位置置信度</span>
        <span className={`font-medium ${textColor}`}>
          {pct}% · {labelMap[level] || level}
        </span>
      </div>
      <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface EkfPanelProps {
  overrideMessage?: TrajectoryMessage | null;
}

export function EkfPanel({ overrideMessage = null }: EkfPanelProps) {
  const currentMessage = useAppStore((s) => s.currentMessage);
  const trajectoryHistory = useAppStore((s) => s.trajectoryHistory);
  const displayMessage = overrideMessage ?? currentMessage;

  const stats = useMemo(() => {
    if (trajectoryHistory.length < 2) return null;
    const first = trajectoryHistory[0].ekf;
    const last = trajectoryHistory[trajectoryHistory.length - 1].ekf;
    const lat1 = first.lat, lon1 = first.lon;
    const lat2 = last.lat, lon2 = last.lon;
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return { distance };
  }, [trajectoryHistory]);

  const ekf = displayMessage?.ekf;
  const rtk = displayMessage?.rtk;

  const positionStd = ekf
    ? [
        Math.sqrt(Math.max(0, ekf.pos_covariance[0][0])),
        Math.sqrt(Math.max(0, ekf.pos_covariance[1][1])),
        Math.sqrt(Math.max(0, ekf.pos_covariance[2][2])),
      ]
    : [0, 0, 0];

  const horizontalStd = ekf
    ? Math.sqrt(Math.max(0, ekf.pos_covariance[0][0]) + Math.max(0, ekf.pos_covariance[1][1]))
    : 0;

  return (
    <div className="w-full h-full flex flex-col gap-2">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-accent/10">
        <Activity className="w-4 h-4 text-accent" />
        <span className="text-sm font-medium text-text-primary">EKF 融合状态</span>
        {ekf?.rtk_lost && (
          <div className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 animate-pulse-slow">
            <SignalZero className="w-3 h-3 text-red-400" />
            <span className="text-[10px] text-red-400 font-medium">RTK 丢失</span>
          </div>
        )}
      </div>

      <div className="px-3">
        {ekf && (
          <div className={`rounded-lg p-2.5 ${
            ekf.rtk_lost
              ? 'bg-red-500/10 border border-red-500/30'
              : ekf.confidence_level === 'high' || ekf.confidence_level === 'good'
                ? 'bg-green-500/10 border border-green-500/20'
                : 'bg-yellow-500/10 border border-yellow-500/20'
          }`}>
            <ConfidenceBar value={ekf.confidence} level={ekf.confidence_level} />
            {ekf.rtk_lost && (
              <div className="mt-2 flex items-center gap-2 text-xs font-mono">
                <SignalZero className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-400">
                  纯惯性导航 · {ekf.rtk_lost_duration.toFixed(1)}s
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 space-y-2">
        <div className="bg-bg-tertiary/60 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <MapPin className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs text-text-secondary">融合位置</span>
          </div>
          <div className="space-y-1 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-text-dim">纬度</span>
              <span className="text-text-primary">{ekf ? formatLat(ekf.lat) : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">经度</span>
              <span className="text-text-primary">{ekf ? formatLon(ekf.lon) : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">高度</span>
              <span className="text-text-primary">{ekf ? `${ekf.alt.toFixed(2)} m` : '--'}</span>
            </div>
          </div>
        </div>

        <div className="bg-bg-tertiary/60 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Navigation className="w-3.5 h-3.5 text-imu" />
            <span className="text-xs text-text-secondary">速度</span>
          </div>
          <div className="space-y-1 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-text-dim">北向</span>
              <span className="text-text-primary">{ekf ? `${ekf.vel_n.toFixed(2)} m/s` : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">东向</span>
              <span className="text-text-primary">{ekf ? `${ekf.vel_e.toFixed(2)} m/s` : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">垂直</span>
              <span className="text-text-primary">{ekf ? `${ekf.vel_d.toFixed(2)} m/s` : '--'}</span>
            </div>
            <div className="border-t border-accent/10 my-1 pt-1 flex justify-between">
              <span className="text-text-dim">合速度</span>
              <span className="text-accent font-medium">
                {ekf ? `${Math.sqrt(ekf.vel_n ** 2 + ekf.vel_e ** 2 + ekf.vel_d ** 2).toFixed(2)} m/s` : '--'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-bg-tertiary/60 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Compass className="w-3.5 h-3.5 text-rtk" />
            <span className="text-xs text-text-secondary">姿态</span>
          </div>
          <div className="space-y-1 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-text-dim">横滚 (Roll)</span>
              <span className="text-text-primary">{ekf ? `${toDeg(ekf.roll).toFixed(2)}°` : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">俯仰 (Pitch)</span>
              <span className="text-text-primary">{ekf ? `${toDeg(ekf.pitch).toFixed(2)}°` : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">航向 (Yaw)</span>
              <span className="text-rtk font-medium">{ekf ? `${toDeg(ekf.yaw).toFixed(2)}°` : '--'}</span>
            </div>
          </div>
        </div>

        <div className="bg-bg-tertiary/60 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
            <span className="text-xs text-text-secondary">估计不确定性</span>
          </div>
          <div className="space-y-1 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-text-dim">σ 纬度</span>
              <span className="text-text-primary">{(positionStd[0] * 111319.9).toFixed(3)} m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">σ 经度</span>
              <span className="text-text-primary">{(positionStd[1] * 111319.9 * Math.cos((ekf?.lat || 0) * Math.PI / 180)).toFixed(3)} m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">σ 高度</span>
              <span className="text-text-primary">{positionStd[2].toFixed(3)} m</span>
            </div>
            <div className="border-t border-accent/10 my-1 pt-1 flex justify-between">
              <span className="text-text-dim">水平不确定</span>
              <span className={horizontalStd > 1 ? 'text-yellow-500' : 'text-green-400'}>
                {(horizontalStd * 111319.9).toFixed(3)} m
              </span>
            </div>
          </div>
        </div>

        {rtk && (
          <div className={`rounded-lg p-3 ${rtk.is_lost ? 'bg-red-500/10 border border-red-500/30' : 'bg-bg-tertiary/60'}`}>
            <div className="flex items-center gap-1.5 mb-2">
              {rtk.is_lost ? (
                <SignalZero className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <Signal className="w-3.5 h-3.5 text-green-400" />
              )}
              <span className="text-xs text-text-secondary">RTK 状态</span>
            </div>
            <div className="space-y-1 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-text-dim">状态</span>
                <span className={rtk.is_lost ? 'text-red-400 font-medium' : 'text-green-400'}>
                  {rtk.is_lost ? '信号丢失' : '正常锁定'}
                </span>
              </div>
              {!rtk.is_lost && (
                <>
                  <div className="flex justify-between">
                    <span className="text-text-dim">精度</span>
                    <span className={rtk.accuracy > 0.1 ? 'text-yellow-500' : 'text-green-400'}>
                      {rtk.accuracy.toFixed(3)} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-dim">高度</span>
                    <span className="text-text-primary">{rtk.alt.toFixed(2)} m</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {stats && (
          <div className="bg-bg-tertiary/60 rounded-lg p-3">
            <div className="flex justify-between font-mono text-xs">
              <span className="text-text-dim">已行驶距离</span>
              <span className="text-accent font-medium">{stats.distance.toFixed(2)} m</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto px-3 py-2 border-t border-accent/10 text-[10px] text-text-dim font-mono">
        数据点: {trajectoryHistory.length}
      </div>
    </div>
  );
}
