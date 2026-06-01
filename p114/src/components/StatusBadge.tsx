import React from 'react';
import type { VTPMStatus } from '../../shared/types';

interface StatusBadgeProps {
  status: VTPMStatus | 'running' | 'stopped' | 'paused';
}

const statusConfig: Record<string, { label: string; className: string }> = {
  available: { label: '可用', className: 'bg-success-600/20 text-success-400 border-success-600/30' },
  assigned: { label: '已分配', className: 'bg-primary-600/20 text-primary-400 border-primary-600/30' },
  error: { label: '错误', className: 'bg-red-600/20 text-red-400 border-red-600/30' },
  initializing: { label: '初始化中', className: 'bg-amber-600/20 text-amber-400 border-amber-600/30' },
  running: { label: '运行中', className: 'bg-success-600/20 text-success-400 border-success-600/30' },
  stopped: { label: '已停止', className: 'bg-dark-600/20 text-dark-400 border-dark-600/30' },
  paused: { label: '已暂停', className: 'bg-amber-600/20 text-amber-400 border-amber-600/30' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.error;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
        status === 'available' || status === 'running' ? 'bg-success-400 animate-pulse' :
        status === 'error' ? 'bg-red-400' :
        status === 'initializing' || status === 'paused' ? 'bg-amber-400' :
        'bg-dark-400'
      }`} />
      {config.label}
    </span>
  );
}
