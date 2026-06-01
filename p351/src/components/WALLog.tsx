import { useEffect, useRef, useState } from 'react';
import { FileText, Play, Pause } from 'lucide-react';
import type { WALEvent } from '@/types';
import { useSimStore } from '@/store/useSimStore';

export default function WALLog() {
  const { state } = useSimStore();
  const logEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state?.wal_events, autoScroll]);

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
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

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header">
        <h2 className="card-title">
          <FileText className="w-5 h-5 text-pg" />
          WAL 日志流
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-mono">
            {state?.wal_events?.length || 0} events
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

      <div className="flex-1 overflow-y-auto bg-slate-950/50 font-mono text-xs p-3 rounded-b-xl">
        {!state?.wal_events?.length ? (
          <div className="text-slate-500 text-center py-8">
            等待 WAL 事件...
          </div>
        ) : (
          <div className="space-y-1">
            {state.wal_events.map((event: WALEvent) => (
              <div
                key={event.id}
                className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-slate-800/50 transition-colors animate-slide-in"
              >
                <span className="text-slate-500 shrink-0">
                  {formatTime(event.timestamp)}
                </span>
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold shrink-0 ${getTypeColor(event.type)}`}>
                  {event.type}
                </span>
                <span className="text-pg-light shrink-0">
                  id={event.record_id}
                </span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-200 truncate">
                  "{event.data}"
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-slate-700/50 flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          INSERT
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          UPDATE
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          DELETE
        </div>
      </div>
    </div>
  );
}
