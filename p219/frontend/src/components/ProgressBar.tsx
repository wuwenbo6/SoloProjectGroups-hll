import React from 'react';
import { FlashStatus } from '../types';

interface ProgressBarProps {
  progress: number;
  status: FlashStatus;
}

const statusLabels: Record<FlashStatus, string> = {
  idle: '就绪',
  connecting: '连接中...',
  flashing: '烧录中...',
  verifying: '验证中...',
  complete: '完成',
  error: '错误',
};

const statusColors: Record<FlashStatus, string> = {
  idle: 'bg-gray-600',
  connecting: 'bg-accent-blue',
  flashing: 'bg-accent-orange',
  verifying: 'bg-accent-cyan',
  complete: 'bg-accent-green',
  error: 'bg-accent-red',
};

export function ProgressBar({ progress, status }: ProgressBarProps) {
  const isActive = status !== 'idle' && status !== 'complete' && status !== 'error';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">
          {statusLabels[status]}
        </span>
        {(isActive || status === 'complete' || status === 'error') && (
          <span className="text-sm font-mono text-white">
            {progress}%
          </span>
        )}
      </div>
      <div className="h-3 bg-dark-border rounded-full overflow-hidden">
        <div
          className={`h-full ${statusColors[status]} transition-all duration-300 rounded-full
            ${isActive ? 'animate-pulse' : ''}
          `}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
