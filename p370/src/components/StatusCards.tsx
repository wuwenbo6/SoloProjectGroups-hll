import { useStore } from '@/hooks/useStore';

const stateConfig: Record<string, { label: string; color: string; bg: string; pulse: boolean }> = {
  connected: { label: '已连接', color: 'text-emerald-400', bg: 'bg-emerald-500', pulse: true },
  disconnected: { label: '未连接', color: 'text-space-500', bg: 'bg-space-600', pulse: false },
  connecting: { label: '连接中', color: 'text-amber-400', bg: 'bg-amber-500', pulse: true },
  recovering: { label: '恢复中', color: 'text-cyber-400', bg: 'bg-cyber-500', pulse: true },
  fault: { label: '故障', color: 'text-red-400', bg: 'bg-red-500', pulse: true },
};

const erlLabels: Record<number, { label: string; desc: string }> = {
  0: { label: 'ERL 0', desc: '会话丢弃' },
  1: { label: 'ERL 1', desc: '命令重试' },
  2: { label: 'ERL 2', desc: '会话恢复' },
};

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function StatusCard() {
  const status = useStore((s) => s.status);
  const cfg = stateConfig[status.connection_state] || stateConfig.disconnected;

  return (
    <div className="rounded-xl bg-space-900/60 backdrop-blur border border-space-800 p-5 transition-all duration-300 hover:border-cyber-800/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-space-400 text-xs font-medium uppercase tracking-wider">连接状态</span>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${cfg.bg} ${cfg.pulse ? 'animate-pulse-slow' : ''}`} />
          <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-space-500">IQN</span>
          <span className="text-space-300 font-mono text-xs truncate max-w-[200px]">{status.target_iqn}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-space-500">运行时长</span>
          <span className="text-space-200 font-mono">{formatUptime(status.uptime)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-space-500">监听地址</span>
          <span className="text-space-300 font-mono text-xs">{status.listen_address}</span>
        </div>
      </div>
    </div>
  );
}

export function ERLCard() {
  const erlLevel = useStore((s) => s.status.erl_level);
  const info = erlLabels[erlLevel];

  return (
    <div className="rounded-xl bg-space-900/60 backdrop-blur border border-space-800 p-5 transition-all duration-300 hover:border-cyber-800/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-space-400 text-xs font-medium uppercase tracking-wider">错误恢复级别</span>
        <span className="text-cyber-400 text-sm font-bold">{info.label}</span>
      </div>
      <p className="text-space-300 text-sm">{info.desc}</p>
      <div className="mt-3 flex gap-2">
        {[0, 1, 2].map((level) => (
          <div
            key={level}
            className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
              level <= erlLevel ? 'bg-cyber-500' : 'bg-space-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function StatsCards() {
  const stats = useStore((s) => s.stats);

  const items = [
    { label: '总命令数', value: stats.totalCommands, color: 'text-space-100' },
    { label: '成功命令', value: stats.successfulCommands, color: 'text-emerald-400' },
    { label: '重传次数', value: stats.totalRetries, color: 'text-amber-400' },
    { label: '失败命令', value: stats.failedCommands, color: 'text-red-400' },
    { label: '故障次数', value: stats.faultCount, color: 'text-orange-400' },
    { label: '恢复次数', value: stats.recoveryCount, color: 'text-cyber-400' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {items.map(({ label, value, color }) => (
        <div
          key={label}
          className="rounded-xl bg-space-900/60 backdrop-blur border border-space-800 p-4 transition-all duration-300 hover:border-cyber-800/50"
        >
          <div className="text-space-500 text-xs font-medium mb-1">{label}</div>
          <div className={`text-2xl font-bold font-mono ${color}`}>{value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
