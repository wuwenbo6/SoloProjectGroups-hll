import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Play, Pause, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import type { AuditLog } from '@/types';
import { useSimStore } from '@/store/useSimStore';

export default function AuditTable() {
  const { state } = useSimStore();
  const logEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state?.audit_logs, autoScroll]);

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  };

  const getOperationColor = (operation: string) => {
    switch (operation) {
      case 'INSERT':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'UPDATE':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'DELETE':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
    }
  };

  const formatUTC = (ts: number) => {
    const dt = new Date(ts * 1000);
    return dt.toISOString().slice(11, 23);
  };

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header">
        <h2 className="card-title">
          <FileSpreadsheet className="w-5 h-5 text-rose-400" />
          Audit 审计日志表
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-mono">
            {state?.audit_logs?.length || 0} 条记录
          </span>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className="p-1 rounded-md hover:bg-slate-700/50 transition-colors"
            title={autoScroll ? '暂停滚动' : '自动滚动'}
          >
            {autoScroll ? (
              <Play className="w-4 h-4 text-emerald-400" />
            ) : (
              <Pause className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-800/95 backdrop-blur-sm z-10">
            <tr className="text-left text-slate-400">
              <th className="px-3 py-2 font-medium border-b border-slate-700/50">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  时间
                </span>
              </th>
              <th className="px-3 py-2 font-medium border-b border-slate-700/50">操作</th>
              <th className="px-3 py-2 font-medium border-b border-slate-700/50">ID</th>
              <th className="px-3 py-2 font-medium border-b border-slate-700/50">变更前</th>
              <th className="px-3 py-2 font-medium border-b border-slate-700/50">变更后</th>
              <th className="px-3 py-2 font-medium border-b border-slate-700/50">状态</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {!state?.audit_logs?.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  暂无审计记录
                </td>
              </tr>
            ) : (
              [...state.audit_logs].reverse().map((log: AuditLog) => (
                <tr
                  key={log.id}
                  className={`border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors ${
                    log.conflict_resolved ? 'bg-amber-500/5' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-slate-500">
                    {formatTime(log.timestamp)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${getOperationColor(
                        log.operation
                      )}`}
                    >
                      {log.operation}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-pg-light font-bold">
                    {log.record_id}
                  </td>
                  <td className="px-3 py-2">
                    {log.before_value ? (
                      <div>
                        <div className="text-slate-400 line-through">
                          {log.before_value}
                        </div>
                        <div className="text-slate-600 text-[10px]">
                          UTC: {log.before_ts && formatUTC(log.before_ts)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-600 italic">NULL</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-emerald-400">
                      {log.after_value}
                    </div>
                    <div className="text-slate-600 text-[10px]">
                      UTC: {formatUTC(log.after_ts)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {log.conflict_resolved ? (
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span
                          className="text-amber-400"
                          title={log.conflict_resolution || ''}
                        >
                          冲突解决
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">正常</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
