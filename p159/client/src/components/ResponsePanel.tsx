import React from 'react';
import { CommandHistoryItem } from '../types';

interface ResponsePanelProps {
  history: CommandHistoryItem[];
}

const statusConfig = {
  pending: { label: '排队中', color: 'text-yellow-400 bg-yellow-500/20', icon: '⏳' },
  processing: { label: '执行中', color: 'text-blue-400 bg-blue-500/20', icon: '⚡' },
  completed: { label: '已完成', color: 'text-green-400 bg-green-500/20', icon: '✓' },
  failed: { label: '失败', color: 'text-red-400 bg-red-500/20', icon: '✕' }
};

export const ResponsePanel: React.FC<ResponsePanelProps> = ({ history }) => {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusBadge = (status: CommandHistoryItem['status']) => {
    const config = statusConfig[status];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${config.color}`}>
        <span>{config.icon}</span>
        {config.label}
      </span>
    );
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">响应记录</h2>
        <span className="text-sm text-slate-400">
          共 {history.length} 条记录
        </span>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
        {history.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p>暂无命令记录</p>
            <p className="text-sm mt-1">连接设备并发送SCPI命令</p>
          </div>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-lg border transition-all ${
                item.status === 'completed'
                  ? 'bg-slate-700/50 border-slate-600'
                  : item.status === 'failed'
                  ? 'bg-red-900/20 border-red-800/50'
                  : item.status === 'processing'
                  ? 'bg-blue-900/20 border-blue-800/50'
                  : 'bg-yellow-900/10 border-yellow-800/30'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-blue-400 bg-slate-800 px-2 py-1 rounded">
                    {item.command}
                  </code>
                  {getStatusBadge(item.status)}
                </div>
                <span className="text-xs text-slate-500">
                  {formatTime(item.timestamp)}
                </span>
              </div>
              {item.status === 'completed' && item.response && (
                <div className="mt-2 p-2 bg-slate-800 rounded">
                  <p className="text-sm font-mono text-green-400 whitespace-pre-wrap">
                    {item.response}
                  </p>
                </div>
              )}
              {item.status === 'failed' && item.error && (
                <div className="mt-2 p-2 bg-red-900/30 rounded">
                  <p className="text-sm text-red-400">
                    错误: {item.error}
                  </p>
                </div>
              )}
              {(item.status === 'pending' || item.status === 'processing') && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm text-slate-400">
                    {item.status === 'pending' ? '等待执行...' : '正在执行...'}
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
