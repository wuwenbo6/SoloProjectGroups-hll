import React, { useRef, useEffect } from 'react';
import { LogEntry, LogLevel } from '../types';

interface LogConsoleProps {
  logs: LogEntry[];
  onClear: () => void;
  autoScroll: boolean;
  onAutoScrollChange: (value: boolean) => void;
}

const levelColors: Record<LogLevel, string> = {
  info: 'text-gray-300',
  warn: 'text-accent-orange',
  error: 'text-accent-red',
  success: 'text-accent-green',
};

export function LogConsole({ logs, onClear, autoScroll, onAutoScrollChange }: LogConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          烧录日志
        </h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => onAutoScrollChange(e.target.checked)}
              className="w-3 h-3 rounded border-gray-600 bg-dark-card text-accent-blue focus:ring-accent-blue"
            />
            自动滚动
          </label>
          <button
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            清空
          </button>
        </div>
      </div>
      
      <div
        ref={containerRef}
        className="flex-1 bg-black/50 rounded-lg p-4 overflow-y-auto font-mono text-sm border border-dark-border"
        style={{ minHeight: '300px', maxHeight: '500px' }}
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>等待烧录开始...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-3">
                <span className="text-gray-600 whitespace-nowrap shrink-0">
                  [{formatTime(log.timestamp)}]
                </span>
                <span className={levelColors[log.level]}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
