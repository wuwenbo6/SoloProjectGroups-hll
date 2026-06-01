import { useDHTStore } from '@/hooks/useDHTStore';
import { Activity, Wifi, WifiOff, Clock, Users } from 'lucide-react';
import { useEffect } from 'react';

export default function NodeStatus() {
  const { nodeStatus, fetchNodeStatus } = useDHTStore();

  useEffect(() => {
    fetchNodeStatus();
    const interval = setInterval(fetchNodeStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchNodeStatus]);

  if (!nodeStatus) {
    return (
      <div className="bg-cyber-card border border-cyber-border rounded-xl p-5">
        <div className="flex items-center gap-2 text-cyber-muted">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-mono">正在连接节点...</span>
        </div>
      </div>
    );
  }

  const formatUptime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyber-green" />
          <h2 className="text-sm font-semibold text-cyber-text tracking-wide uppercase">
            节点状态
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {nodeStatus.running ? (
            <>
              <span className="w-2 h-2 bg-cyber-green rounded-full animate-pulse-green" />
              <span className="text-xs font-mono text-cyber-green">运行中</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 bg-cyber-red rounded-full" />
              <span className="text-xs font-mono text-cyber-red">已停止</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <span className="text-xs text-cyber-muted font-mono">Node ID</span>
          <p className="text-sm font-mono text-cyber-green text-glow-green truncate" title={nodeStatus.node_id}>
            {nodeStatus.node_id.substring(0, 16)}...
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-cyber-muted font-mono">监听地址</span>
          <div className="flex items-center gap-1">
            {nodeStatus.running ? (
              <Wifi className="w-3.5 h-3.5 text-cyber-green" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-cyber-red" />
            )}
            <p className="text-sm font-mono text-cyber-text">{nodeStatus.address}</p>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-cyber-muted font-mono">已知节点</span>
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-cyber-blue" />
            <p className="text-sm font-mono text-cyber-text">{nodeStatus.known_nodes}</p>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-cyber-muted font-mono">运行时长</span>
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-cyber-yellow" />
            <p className="text-sm font-mono text-cyber-text">{formatUptime(nodeStatus.uptime_seconds)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
