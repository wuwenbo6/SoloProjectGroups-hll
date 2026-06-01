import { Play, Pause, RotateCcw, Database, Wifi, WifiOff } from 'lucide-react';
import { useAppStore } from '@/store';
import { useWebSocket } from '@/hooks/useWebSocket';

export function ControlBar() {
  const isConnected = useAppStore((s) => s.isConnected);
  const wsError = useAppStore((s) => s.wsError);
  const reset = useAppStore((s) => s.reset);
  const { connect, disconnect, sendControl } = useWebSocket();

  const handleStart = async () => {
    if (!isConnected) {
      connect();
    } else {
      await sendControl('start');
    }
  };

  const handlePause = async () => {
    await sendControl('stop');
  };

  const handleReset = async () => {
    await sendControl('reset');
    reset();
  };

  const handleDisconnect = () => {
    disconnect();
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
      <div className="glass-panel rounded-full px-4 py-3 flex items-center gap-3 animate-glow">
        <div className="flex items-center gap-2 pr-3 border-r border-accent/20">
          {isConnected ? (
            <Wifi className="w-4 h-4 text-green-400 animate-pulse-slow" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-400" />
          )}
          <span className="text-xs font-mono">
            {wsError || (isConnected ? '已连接' : '未连接')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleStart}
            disabled={!isConnected}
            className="group flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent/20 hover:bg-accent/30 text-accent text-sm font-medium transition-all btn-glow disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent/20 disabled:hover:shadow-none"
          >
            <Play className="w-4 h-4" />
            <span>开始</span>
          </button>

          <button
            onClick={handlePause}
            disabled={!isConnected}
            className="group flex items-center gap-1.5 px-4 py-2 rounded-full bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Pause className="w-4 h-4" />
            <span>暂停</span>
          </button>

          <button
            onClick={handleReset}
            className="group flex items-center gap-1.5 px-4 py-2 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>重置</span>
          </button>

          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="group flex items-center gap-1.5 px-4 py-2 rounded-full bg-bg-tertiary/60 hover:bg-bg-tertiary text-text-secondary hover:text-text-primary text-sm font-medium transition-all"
            >
              <Database className="w-4 h-4" />
              <span>断开</span>
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="group flex items-center gap-1.5 px-4 py-2 rounded-full bg-bg-tertiary/60 hover:bg-bg-tertiary text-text-secondary hover:text-text-primary text-sm font-medium transition-all"
            >
              <Database className="w-4 h-4" />
              <span>连接</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
