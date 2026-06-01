import { Activity, Server, Clock, Hash } from 'lucide-react';
import { useLogStore } from '@/stores/logStore';
import { LEVEL_NAMES } from '@/types';

const HOST_COLORS = [
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
];

function getHostColor(host: string): string {
  let hash = 0;
  for (let i = 0; i < host.length; i++) {
    hash = host.charCodeAt(i) + ((hash << 5) - hash);
  }
  return HOST_COLORS[Math.abs(hash) % HOST_COLORS.length];
}

export default function StatsPanel() {
  const { stats } = useLogStore();

  if (!stats) return null;

  const topHosts = Object.entries(stats.hostCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const maxHostCount = topHosts.length > 0 ? topHosts[0][1] : 1;

  return (
    <div className="space-y-4">
      <div className="bg-gelf-surface border border-gelf-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-gelf-accent" />
          <h3 className="text-sm font-semibold text-gelf-text uppercase tracking-wider">概览</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gelf-bg rounded-lg p-3 text-center">
            <Hash size={18} className="text-gelf-accent mx-auto mb-1" />
            <div className="text-2xl font-bold font-mono text-gelf-accent animate-glow-pulse rounded-lg">
              {stats.totalLogs.toLocaleString()}
            </div>
            <div className="text-xs text-gelf-muted mt-1">日志总数</div>
          </div>
          <div className="bg-gelf-bg rounded-lg p-3 text-center">
            <Clock size={18} className="text-gelf-success mx-auto mb-1" />
            <div className="text-xs font-mono text-gelf-success truncate">
              {stats.lastReceived
                ? new Date(stats.lastReceived).toLocaleTimeString('zh-CN')
                : '--:--:--'}
            </div>
            <div className="text-xs text-gelf-muted mt-1">最近接收</div>
          </div>
        </div>
      </div>

      <div className="bg-gelf-surface border border-gelf-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Server size={16} className="text-gelf-accent" />
          <h3 className="text-sm font-semibold text-gelf-text uppercase tracking-wider">主机分布</h3>
        </div>
        <div className="space-y-2">
          {topHosts.map(([host, count]) => (
            <div key={host} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={`px-2 py-0.5 rounded border font-mono ${getHostColor(host)}`}>
                  {host}
                </span>
                <span className="text-gelf-muted font-mono">{count}</span>
              </div>
              <div className="h-1.5 bg-gelf-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-gelf-accent/60 rounded-full transition-all duration-500"
                  style={{ width: `${(count / maxHostCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gelf-surface border border-gelf-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-gelf-accent" />
          <h3 className="text-sm font-semibold text-gelf-text uppercase tracking-wider">级别分布</h3>
        </div>
        <div className="space-y-1.5">
          {Object.entries(stats.levelCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([level, count]) => (
              <div key={level} className="flex items-center justify-between text-xs">
                <span className="font-mono text-gelf-muted">{LEVEL_NAMES[Number(level)] || level}</span>
                <span className="font-mono text-gelf-text">{count}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
