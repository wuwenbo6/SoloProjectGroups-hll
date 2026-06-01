import React from 'react';

interface ConnectionStatusProps {
  isConnected: boolean;
}

export function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${
        isConnected 
          ? 'bg-accent-green animate-pulse shadow-lg shadow-accent-green/50' 
          : 'bg-gray-600'
      }`} />
      <span className={`text-sm ${
        isConnected ? 'text-accent-green' : 'text-gray-500'
      }`}>
        {isConnected ? '已连接' : '未连接'}
      </span>
    </div>
  );
}
