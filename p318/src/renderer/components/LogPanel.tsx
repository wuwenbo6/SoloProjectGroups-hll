import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Trash2, Filter } from 'lucide-react';
import { useSimStore } from '../store/useSimStore';
import type { LogEntry } from '../../shared/types';

type LogLevel = LogEntry['level'] | 'all';

export const LogPanel: React.FC = () => {
  const logs = useSimStore((s) => s.logs);
  const nodeConfigs = useSimStore((s) => s.nodeConfigs);
  const clearLogs = useSimStore((s) => s.clearLogs);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<LogLevel>('all');
  const [autoScroll, setAutoScroll] = useState(true);

  const filteredLogs = useMemo(
    () => {
      if (filter === 'all') return logs;
      return logs.filter((l) => l.level === filter);
    },
    [logs, filter]
  );

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
  };

  const getLogIcon = (level: LogEntry['level']): string => {
    switch (level) {
      case 'info':
        return 'ℹ️';
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
    }
  };

  const getNodeName = (nodeId?: string): string => {
    if (!nodeId) return '';
    return nodeConfigs[nodeId]?.name || nodeId.slice(-8);
  };

  return (
    <div className="card p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          通信日志
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-slate-400" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as LogLevel)}
              className="input py-1 text-xs"
            >
              <option value="all">全部</option>
              <option value="info">信息</option>
              <option value="success">成功</option>
              <option value="warning">警告</option>
              <option value="error">错误</option>
            </select>
          </div>
          <label className="flex items-center gap-1 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            自动滚动
          </label>
          <button
            className="btn btn-secondary btn-sm"
            onClick={clearLogs}
            title="清空日志"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin font-mono text-xs bg-slate-950/80 rounded-lg p-3 border border-slate-800">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-500 text-center py-8">
            <p>暂无日志</p>
            <p className="text-xs mt-2">点击"开始模拟"按钮开始记录通信日志</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className={`py-1 px-2 rounded mb-1 transition-colors hover:bg-slate-800/50 log-${log.level}`}
            >
              <span className="text-slate-500">[{formatTime(log.timestamp)}]</span>{' '}
              <span>{getLogIcon(log.level)}</span>{' '}
              {log.nodeId && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: `${nodeConfigs[log.nodeId]?.color || '#666'}20`,
                    color: nodeConfigs[log.nodeId]?.color || '#999',
                  }}
                >
                  {getNodeName(log.nodeId)}
                </span>
              )}{' '}
              <span>{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50 text-xs text-slate-400">
        <span>共 {filteredLogs.length} 条日志</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            成功: {logs.filter((l) => l.level === 'success').length}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            错误: {logs.filter((l) => l.level === 'error').length}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            警告: {logs.filter((l) => l.level === 'warning').length}
          </span>
        </div>
      </div>
    </div>
  );
};
