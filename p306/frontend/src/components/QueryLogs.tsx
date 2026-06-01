import { useDHTStore } from '@/hooks/useDHTStore';
import { ScrollText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

export default function QueryLogs() {
  const { logs, fetchLogs } = useDHTStore();

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-3.5 h-3.5 text-cyber-green" />;
      case 'timeout':
        return <AlertTriangle className="w-3.5 h-3.5 text-cyber-yellow" />;
      default:
        return <XCircle className="w-3.5 h-3.5 text-cyber-red" />;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-cyber-green';
      case 'timeout': return 'text-cyber-yellow';
      default: return 'text-cyber-red';
    }
  };

  const typeColor = (type: string) => {
    return type === 'ping' ? 'text-cyber-green bg-cyber-green/10 border-cyber-green/30' : 'text-cyber-blue bg-cyber-blue/10 border-cyber-blue/30';
  };

  const reversedLogs = [...logs].reverse();

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="w-5 h-5 text-cyber-green" />
        <h2 className="text-sm font-semibold text-cyber-text tracking-wide uppercase">
          查询日志
        </h2>
        <span className="ml-auto text-xs font-mono text-cyber-muted">{logs.length} 条记录</span>
      </div>

      {reversedLogs.length === 0 ? (
        <div className="text-center py-8 text-cyber-muted text-sm font-mono">
          暂无查询记录
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {reversedLogs.map((log, i) => (
            <div
              key={`${log.transaction_id}-${i}`}
              className="bg-cyber-bg rounded-lg p-3 border border-cyber-border animate-fade-in"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {statusIcon(log.status)}
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${typeColor(log.query_type)}`}>
                    {log.query_type.toUpperCase()}
                  </span>
                  <span className="text-xs font-mono text-cyber-muted">
                    tx:{log.transaction_id}
                  </span>
                </div>
                <span className={`text-xs font-mono ${statusColor(log.status)}`}>
                  {log.elapsed_ms}ms
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-cyber-muted truncate max-w-[200px]" title={log.target}>
                  → {log.target}
                </span>
                <span className="text-xs text-cyber-muted font-mono">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {log.result_summary && (
                <p className="text-xs font-mono text-cyber-text/70 mt-1 truncate" title={log.result_summary}>
                  {log.result_summary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
