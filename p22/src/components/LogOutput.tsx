import React, { useRef, useEffect } from 'react';
import { ScrollText, Trash2 } from 'lucide-react';

interface LogOutputProps {
  logs: string[];
  onClear?: () => void;
  maxHeight?: string;
}

export function LogOutput({ logs, onClear, maxHeight = '200px' }: LogOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const formatLog = (log: string) => {
    if (log.includes('✓') || log.includes('完成') || log.includes('Done')) {
      return <span className="text-success">{log}</span>;
    }
    if (log.includes('错误') || log.includes('Error') || log.includes('error')) {
      return <span className="text-error">{log}</span>;
    }
    if (log.startsWith('ffmpeg') || log.includes('执行命令')) {
      return <span className="text-primary-400">{log}</span>;
    }
    return <span className="text-dark-100">{log}</span>;
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-primary-400" />
          <span className="text-sm font-medium">处理日志</span>
        </div>
        {logs.length > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-xs text-dark-200 hover:text-white transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            清空
          </button>
        )}
      </div>
      
      <div
        ref={scrollRef}
        className="terminal rounded-lg p-3 font-mono text-xs overflow-y-auto"
        style={{ maxHeight }}
      >
        {logs.length === 0 ? (
          <p className="text-dark-400 italic">暂无日志...</p>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="text-dark-400 select-none">{String(index + 1).padStart(3, '0')}</span>
                {formatLog(log)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
