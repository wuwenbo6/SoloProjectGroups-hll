import { Power, PowerOff, RefreshCw, Wifi, WifiOff, AlertTriangle, Clock, RotateCcw } from 'lucide-react';
import { cn, parseResumeToken, formatTokenDisplay, getErrorCodeInfo } from '../lib/utils.js';
import type { ResumeTokenError, OpTime } from '../../shared/types.js';

interface ConnectionStatusProps {
  isConnected: boolean;
  isResuming: boolean;
  lastToken: string | null;
  missedEventCount: number | null;
  resumedCount: number;
  tokenError: ResumeTokenError | null;
  currentTerm: number | null;
  currentOptime: OpTime | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onClearEvents: () => void;
  onResetToken: () => void;
  onClearTokenError: () => void;
  onAdvanceTerm: () => void;
}

export function ConnectionStatus({
  isConnected,
  isResuming,
  lastToken,
  missedEventCount,
  resumedCount,
  tokenError,
  currentTerm,
  currentOptime,
  onConnect,
  onDisconnect,
  onClearEvents,
  onResetToken,
  onClearTokenError,
  onAdvanceTerm,
}: ConnectionStatusProps) {
  const parsed = lastToken ? parseResumeToken(lastToken) : null;
  const errorInfo = tokenError ? getErrorCodeInfo(tokenError.code) : null;

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            {isConnected ? (
              <Wifi className="w-5 h-5 text-green-500" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-500" />
            )}
            {isConnected && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
            )}
            {isResuming && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
            )}
          </div>
          <div>
            <div className="font-mono text-sm font-semibold">
              {isResuming ? (
                <span className="text-amber-400">恢复连接中...</span>
              ) : isConnected ? (
                <span className="text-green-400">已连接</span>
              ) : (
                <span className="text-red-400">已断开</span>
              )}
            </div>
            {missedEventCount !== null && missedEventCount > 0 && (
              <div className="text-xs text-zinc-400 font-mono mt-0.5">
                补发 {resumedCount}/{missedEventCount} 个事件
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <button
              onClick={onDisconnect}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium',
                'bg-red-500/10 text-red-400 border border-red-500/30',
                'hover:bg-red-500/20 transition-colors'
              )}
            >
              <PowerOff className="w-4 h-4" />
              断开
            </button>
          ) : (
            <button
              onClick={onConnect}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium',
                tokenError
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'bg-green-500/10 text-green-400 border border-green-500/30',
                'hover:bg-green-500/20 transition-colors'
              )}
            >
              <Power className="w-4 h-4" />
              {lastToken ? '重连（续传）' : '连接'}
            </button>
          )}
          <button
            onClick={onClearEvents}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium',
              'bg-zinc-700/50 text-zinc-300 border border-zinc-600',
              'hover:bg-zinc-700 transition-colors'
            )}
          >
            <RefreshCw className="w-4 h-4" />
            清空
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs text-zinc-500">逻辑时钟 (Term)</span>
          </div>
          <div className="font-mono text-sm font-bold text-purple-400">
            {currentTerm ?? '-'}
            {parsed && parsed.term !== currentTerm && (
              <span className="text-xs text-zinc-600 ml-2">
                (token: {parsed.term})
              </span>
            )}
          </div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs text-zinc-500">OpTime (ts:inc)</span>
          </div>
          <div className="font-mono text-sm font-bold text-cyan-400">
            {currentOptime ? `${currentOptime.ts}:${currentOptime.inc}` : '-'}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-zinc-500 mb-1">Resume Token</div>
          <div className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 overflow-hidden">
            {lastToken ? (
              <>
                <code className="text-amber-400 truncate block">{lastToken}</code>
                <code className="text-zinc-500 text-[10px] block mt-0.5">
                  {formatTokenDisplay(lastToken)}
                </code>
              </>
            ) : (
              <code className="text-zinc-600 italic">无</code>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          {lastToken && (
            <button
              onClick={onResetToken}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 border border-zinc-700 rounded transition-colors"
            >
              重置Token
            </button>
          )}
          <button
            onClick={onAdvanceTerm}
            className="text-xs text-purple-500 hover:text-purple-300 px-2 py-1 border border-purple-500/30 rounded transition-colors"
          >
            推进Term
          </button>
        </div>
      </div>

      {tokenError && (
        <div className={cn(
          'border rounded-md p-3',
          'border-red-500/30 bg-red-500/5'
        )}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  'text-xs font-mono font-semibold px-1.5 py-0.5 rounded',
                  'bg-red-500/10 text-red-400'
                )}>
                  {tokenError.code}
                </span>
                <span className="text-xs font-mono text-red-300 font-semibold">
                  {errorInfo?.label || 'UNKNOWN'}
                </span>
              </div>
              <p className="text-xs text-zinc-300 mb-1">{tokenError.message}</p>
              {tokenError.detail && (
                <p className="text-xs text-zinc-500 font-mono">{tokenError.detail}</p>
              )}
              {tokenError.currentTerm && (
                <p className="text-xs text-zinc-500 mt-1">
                  当前 Term: {tokenError.currentTerm}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => { onResetToken(); onClearTokenError(); }}
                  className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded transition-colors"
                >
                  重置Token并重连
                </button>
                <button
                  onClick={onClearTokenError}
                  className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 border border-zinc-700 rounded transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
