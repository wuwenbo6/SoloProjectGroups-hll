import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { LogEntry } from '@/stores/uploadStore';

interface TransferLogProps {
  logs: LogEntry[];
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + `.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

const typeConfig: Record<LogEntry['type'], { color: string; prefix: string }> = {
  send: { color: 'text-sky-400', prefix: '→' },
  ack: { color: 'text-teal-400', prefix: '←' },
  error: { color: 'text-red-400', prefix: '✕' },
  info: { color: 'text-amber-400', prefix: '●' },
};

export function TransferLog({ logs }: TransferLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="text-xs text-zinc-500 ml-1">CoAP Transfer Log</span>
      </div>
      <div
        ref={containerRef}
        className="max-h-[280px] overflow-y-auto p-3"
        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', lineHeight: '1.6' }}
      >
        {logs.length === 0 ? (
          <p className="text-zinc-600 text-center py-4">等待传输日志...</p>
        ) : (
          logs.map((log, i) => {
            const config = typeConfig[log.type];
            return (
              <div
                key={i}
                className={cn('flex gap-2', i > 0 && 'mt-0.5')}
              >
                <span className="text-zinc-600 shrink-0">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className={cn('shrink-0', config.color)}>
                  {config.prefix}
                </span>
                <span className={cn(
                  log.type === 'error' ? 'text-red-300' :
                  log.type === 'ack' ? 'text-teal-300' :
                  log.type === 'send' ? 'text-sky-300' :
                  'text-amber-300'
                )}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
