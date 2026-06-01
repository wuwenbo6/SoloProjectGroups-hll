import { useEffect } from 'react';
import { Wifi, Usb, X, Clock, Loader2, Link2, Unplug } from 'lucide-react';
import useReplStore from '@/store/repl-store';
import { cn } from '@/lib/utils';
import type { ClientMessage, UartConfig, TelnetConfig } from '../../shared/types';
import type { ConnectionHistoryEntry } from '@/store/repl-store';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

interface ConnectionPanelProps {
  onConnect: (msg: ClientMessage) => void;
  onDisconnect: () => void;
}

export default function ConnectionPanel({ onConnect, onDisconnect }: ConnectionPanelProps) {
  const {
    connectionState,
    transportType,
    uartConfig,
    telnetConfig,
    connectionHistory,
    errorMessage,
    setTransportType,
    updateUartConfig,
    updateTelnetConfig,
    addConnectionHistory,
    removeConnectionHistory,
    loadConnectionHistory,
    clearError,
  } = useReplStore();

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  const isDisabled = isConnecting;

  const handleConnect = () => {
    if (isConnected) {
      onDisconnect();
      return;
    }

    if (transportType === 'uart') {
      if (!uartConfig.path.trim()) return;
      onConnect({ type: 'connect', transport: 'uart', config: uartConfig });
      addConnectionHistory({
        transport: 'uart',
        config: { ...uartConfig },
        label: `${uartConfig.path} @ ${uartConfig.baudRate}`,
        timestamp: Date.now(),
      });
    } else {
      if (!telnetConfig.host.trim()) return;
      onConnect({ type: 'connect', transport: 'telnet', config: telnetConfig });
      addConnectionHistory({
        transport: 'telnet',
        config: { ...telnetConfig },
        label: `${telnetConfig.host}:${telnetConfig.port}`,
        timestamp: Date.now(),
      });
    }
  };

  const handleHistoryClick = (entry: ConnectionHistoryEntry) => {
    setTransportType(entry.transport);
    if (entry.transport === 'uart') {
      updateUartConfig(entry.config as UartConfig);
    } else {
      updateTelnetConfig(entry.config as TelnetConfig);
    }
  };

  const statusColor = {
    disconnected: 'bg-gray-500',
    connecting: 'bg-yellow-400 animate-pulse',
    connected: 'bg-terminal-fg',
    error: 'bg-red-500',
  }[connectionState];

  const statusText = {
    disconnected: '未连接',
    connecting: '连接中...',
    connected: '已连接',
    error: '连接错误',
  }[connectionState];

  useEffect(() => {
    loadConnectionHistory();
  }, [loadConnectionHistory]);

  return (
    <div className="flex flex-col h-full p-4 space-y-5 overflow-y-auto">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-terminal-fg/80 tracking-wider uppercase">
          连接设置
        </h2>
      </div>

      <div className="flex rounded-lg overflow-hidden border border-terminal-border">
        <button
          onClick={() => setTransportType('uart')}
          disabled={isDisabled}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all',
            transportType === 'uart'
              ? 'bg-terminal-fg/10 text-terminal-fg border-b-2 border-terminal-fg'
              : 'bg-transparent text-gray-500 hover:text-gray-300'
          )}
        >
          <Usb size={14} />
          UART
        </button>
        <button
          onClick={() => setTransportType('telnet')}
          disabled={isDisabled}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all',
            transportType === 'telnet'
              ? 'bg-terminal-blue/10 text-terminal-blue border-b-2 border-terminal-blue'
              : 'bg-transparent text-gray-500 hover:text-gray-300'
          )}
        >
          <Wifi size={14} />
          Telnet
        </button>
      </div>

      {transportType === 'uart' ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">串口路径</label>
            <input
              type="text"
              value={uartConfig.path}
              onChange={(e) => updateUartConfig({ path: e.target.value })}
              placeholder="/dev/ttyUSB0"
              disabled={isDisabled}
              className="w-full bg-terminal-bg border border-terminal-border rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-terminal-fg/50 focus:ring-1 focus:ring-terminal-fg/20 transition-all disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">波特率</label>
            <select
              value={uartConfig.baudRate}
              onChange={(e) => updateUartConfig({ baudRate: Number(e.target.value) })}
              disabled={isDisabled}
              className="w-full bg-terminal-bg border border-terminal-border rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-terminal-fg/50 focus:ring-1 focus:ring-terminal-fg/20 transition-all disabled:opacity-50 appearance-none cursor-pointer"
            >
              {BAUD_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">主机地址</label>
            <input
              type="text"
              value={telnetConfig.host}
              onChange={(e) => updateTelnetConfig({ host: e.target.value })}
              placeholder="192.168.1.1"
              disabled={isDisabled}
              className="w-full bg-terminal-bg border border-terminal-border rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-terminal-blue/50 focus:ring-1 focus:ring-terminal-blue/20 transition-all disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">端口</label>
            <input
              type="number"
              value={telnetConfig.port}
              onChange={(e) => updateTelnetConfig({ port: Number(e.target.value) })}
              placeholder="23"
              disabled={isDisabled}
              className="w-full bg-terminal-bg border border-terminal-border rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-terminal-blue/50 focus:ring-1 focus:ring-terminal-blue/20 transition-all disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">密码 (可选)</label>
            <input
              type="password"
              value={telnetConfig.password || ''}
              onChange={(e) => updateTelnetConfig({ password: e.target.value })}
              placeholder="••••••"
              disabled={isDisabled}
              className="w-full bg-terminal-bg border border-terminal-border rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-terminal-blue/50 focus:ring-1 focus:ring-terminal-blue/20 transition-all disabled:opacity-50"
            />
          </div>
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={isConnecting || (transportType === 'uart' && !uartConfig.path.trim()) || (transportType === 'telnet' && !telnetConfig.host.trim())}
        className={cn(
          'w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2',
          isConnected
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
            : 'bg-terminal-fg/15 text-terminal-fg border border-terminal-fg/30 hover:bg-terminal-fg/25 hover:shadow-[0_0_20px_rgba(0,255,136,0.15)]',
          isConnecting && 'animate-pulse',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none'
        )}
      >
        {isConnecting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            连接中...
          </>
        ) : isConnected ? (
          <>
            <Unplug size={16} />
            断开连接
          </>
        ) : (
          <>
            <Link2 size={16} />
            连接
          </>
        )}
      </button>

      <div className="flex items-center gap-2 px-1">
        <div className={cn('w-2 h-2 rounded-full', statusColor)} />
        <span className="text-xs text-gray-400">{statusText}</span>
      </div>

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2">
          <span className="text-xs text-red-400 flex-1">{errorMessage}</span>
          <button onClick={clearError} className="text-red-400/60 hover:text-red-400">
            <X size={12} />
          </button>
        </div>
      )}

      {connectionHistory.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock size={12} />
            <span>连接历史</span>
          </div>
          <div className="space-y-1">
            {connectionHistory.map((entry) => (
              <button
                key={entry.timestamp}
                onClick={() => handleHistoryClick(entry)}
                disabled={isDisabled}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md bg-terminal-surface/50 border border-transparent hover:border-terminal-fg/20 text-left transition-all group disabled:opacity-50"
              >
                {entry.transport === 'uart' ? (
                  <Usb size={12} className="text-terminal-fg/60 shrink-0" />
                ) : (
                  <Wifi size={12} className="text-terminal-blue/60 shrink-0" />
                )}
                <span className="text-xs text-gray-300 truncate flex-1">{entry.label}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeConnectionHistory(entry.timestamp);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity shrink-0"
                >
                  <X size={12} />
                </button>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

