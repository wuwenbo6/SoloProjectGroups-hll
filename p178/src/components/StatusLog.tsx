import { useRef, useEffect } from 'react';
import { Info, Send, AlertTriangle, Trophy, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { LogEntry } from '../types/bus';
import { cn } from '../lib/utils';

interface StatusLogProps {
  logs: LogEntry[];
  onClear: () => void;
}

const iconMap = {
  info: Info,
  send: Send,
  collision: AlertTriangle,
  arbitration: Trophy,
  complete: CheckCircle,
  error: XCircle,
  backoff: Clock,
};

const colorMap = {
  info: 'text-[#8899aa]',
  send: 'text-[#00d4ff]',
  collision: 'text-[#ef4444]',
  arbitration: 'text-[#f59e0b]',
  complete: 'text-[#10b981]',
  error: 'text-[#ef4444]',
  backoff: 'text-[#8b5cf6]',
};

const bgMap = {
  info: 'bg-[#8899aa]/10',
  send: 'bg-[#00d4ff]/10',
  collision: 'bg-[#ef4444]/10',
  arbitration: 'bg-[#f59e0b]/10',
  complete: 'bg-[#10b981]/10',
  error: 'bg-[#ef4444]/10',
  backoff: 'bg-[#8b5cf6]/10',
};

export default function StatusLog({ logs, onClear }: StatusLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-[#00d4ff]">状态日志</h2>
        <button
          onClick={onClear}
          disabled={logs.length === 0}
          className="px-3 py-1.5 text-xs rounded border border-[#1a2332] bg-[#0f1623] text-[#8899aa] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          清空
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[200px] max-h-[350px]"
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#3a4556] text-sm">
            暂无日志，开始模拟后将显示事件记录
          </div>
        ) : (
          logs.map(log => {
            const Icon = iconMap[log.type];
            return (
              <div
                key={log.id}
                className={cn(
                  'flex items-start gap-2 px-2 py-1.5 rounded text-xs',
                  bgMap[log.type]
                )}
              >
                <Icon size={12} className={cn('mt-0.5 shrink-0', colorMap[log.type])} />
                <div className="flex-1 min-w-0">
                  <span className="text-[#667788] font-mono mr-2">
                    [{log.timestamp}bit]
                  </span>
                  <span className={colorMap[log.type]}>{log.message}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
