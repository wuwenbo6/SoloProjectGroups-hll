import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'running' | 'stopped' | 'paused' | 'online' | 'offline';
  size?: 'sm' | 'md';
}

const statusConfig = {
  running: { label: '运行中', class: 'bg-green-500/20 text-green-400' },
  stopped: { label: '已停止', class: 'bg-red-500/20 text-red-400' },
  paused: { label: '已暂停', class: 'bg-amber-500/20 text-amber-400' },
  online: { label: '在线', class: 'bg-green-500/20 text-green-400' },
  offline: { label: '离线', class: 'bg-red-500/20 text-red-400' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        config.class
      )}
    >
      <span className={cn('rounded-full', size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2')}
        style={{ backgroundColor: 'currentColor' }}
      />
      {config.label}
    </span>
  );
};
