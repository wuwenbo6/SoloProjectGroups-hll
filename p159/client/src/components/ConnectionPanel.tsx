import React from 'react';
import { DeviceStatus } from '../types';

interface ConnectionPanelProps {
  status: DeviceStatus;
  host: string;
  port: string;
  onHostChange: (value: string) => void;
  onPortChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  isLoading: boolean;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  status,
  host,
  port,
  onHostChange,
  onPortChange,
  onConnect,
  onDisconnect,
  isLoading
}) => {
  return (
    <div className="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">设备连接</h2>
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${status.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
          />
          <span className={`text-sm ${status.connected ? 'text-green-400' : 'text-red-400'}`}>
            {status.connected ? '已连接' : '未连接'}
          </span>
        </div>
      </div>

      {status.connected && (
        <div className="mb-4 p-3 bg-slate-700/50 rounded-lg">
          <p className="text-sm text-slate-400">
            当前设备: <span className="text-white font-mono">{status.host}:{status.port}</span>
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">设备地址</label>
            <input
              type="text"
              value={host}
              onChange={(e) => onHostChange(e.target.value)}
              placeholder="192.168.1.100"
              disabled={status.connected || isLoading}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">端口</label>
            <input
              type="number"
              value={port}
              onChange={(e) => onPortChange(e.target.value)}
              placeholder="5555"
              disabled={status.connected || isLoading}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex gap-3">
          {!status.connected ? (
            <button
              onClick={onConnect}
              disabled={isLoading || !host || !port}
              className="flex-1 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isLoading ? '连接中...' : '连接设备'}
            </button>
          ) : (
            <button
              onClick={onDisconnect}
              disabled={isLoading}
              className="flex-1 px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isLoading ? '断开中...' : '断开连接'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
