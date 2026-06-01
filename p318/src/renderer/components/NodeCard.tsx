import React from 'react';
import { Play, Trash2, Settings } from 'lucide-react';
import type { NodeConfig, NodeState } from '../../shared/types';
import { useSimStore } from '../store/useSimStore';

interface NodeCardProps {
  config: NodeConfig;
  state?: NodeState;
}

const statusLabels: Record<NodeState['status'], string> = {
  idle: '空闲',
  listening: '监听中',
  sending: '发送中',
  conflict: '冲突',
  waiting: '等待重试',
  success: '发送成功',
  responding: '响应中',
};

export const NodeCard: React.FC<NodeCardProps> = ({ config, state }) => {
  const manualSend = useSimStore((s) => s.manualSend);
  const removeNode = useSimStore((s) => s.removeNode);
  const updateNode = useSimStore((s) => s.updateNode);
  const busState = useSimStore((s) => s.busState);
  const busConfig = useSimStore((s) => s.busConfig);
  const utilization = useSimStore((s) => s.utilization);

  const handleManualSend = () => {
    manualSend(config.id);
  };

  const handleRemove = () => {
    removeNode(config.id);
  };

  const handleToggleEnabled = () => {
    updateNode(config.id, { enabled: !config.enabled });
  };

  const status = state?.status || 'idle';
  const isActive = busState.isRunning && config.enabled;
  const isModbusMode = busConfig.mode === 'modbus-rtu';
  const nodeUtil = utilization.perNodeStats[config.id];

  return (
    <div
      className={`card p-4 transition-all duration-300 ${
        status === 'conflict' ? 'conflict-flash' : ''
      } ${status === 'sending' || status === 'responding' ? 'card-glow' : ''}`}
      style={{ borderColor: isActive ? `${config.color}40` : undefined }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: config.color, boxShadow: `0 0 8px ${config.color}` }}
          />
          <div>
            <h3 className="font-semibold text-slate-100">{config.name}</h3>
            <p className="text-xs text-slate-500 font-mono">
              {isModbusMode ? (
                config.role === 'master' ? '主站 (Master)' : `从站 ID: ${config.slaveId}`
              ) : (
                `ID: ${config.id.slice(-8)}`
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isModbusMode && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              config.role === 'master' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              {config.role === 'master' ? 'M' : 'S'}
            </span>
          )}
          <div className={`status-indicator status-${status}`} title={statusLabels[status]} />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span
          className={`text-xs px-2 py-1 rounded-full font-medium ${
            status === 'idle'
              ? 'bg-slate-700 text-slate-300'
              : status === 'listening'
              ? 'bg-amber-500/20 text-amber-400'
              : status === 'sending'
              ? 'bg-blue-500/20 text-blue-400'
              : status === 'conflict'
              ? 'bg-red-500/20 text-red-400'
              : status === 'waiting'
              ? 'bg-orange-500/20 text-orange-400'
              : status === 'responding'
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'bg-green-500/20 text-green-400'
          }`}
        >
          {statusLabels[status]}
        </span>
        <span className="text-xs text-slate-500">
          间隔: {config.sendInterval.toFixed(0)}ms
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-slate-900/50 rounded-lg p-2">
          <p className="text-xs text-slate-500 mb-1">上次延时</p>
          <p className="text-lg font-mono font-semibold text-blue-400">
            {state?.lastSendDelay?.toFixed(0) || '-'}
            <span className="text-xs text-slate-500 ml-1">ms</span>
          </p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-2">
          <p className="text-xs text-slate-500 mb-1">平均延时</p>
          <p className="text-lg font-mono font-semibold text-cyan-400">
            {state?.avgSendDelay?.toFixed(1) || '-'}
            <span className="text-xs text-slate-500 ml-1">ms</span>
          </p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-2">
          <p className="text-xs text-slate-500 mb-1">发送成功</p>
          <p className="text-lg font-mono font-semibold text-green-400">
            {state?.sendCount || 0}
          </p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-2">
          <p className="text-xs text-slate-500 mb-1">冲突次数</p>
          <p className="text-lg font-mono font-semibold text-red-400">
            {state?.conflictCount || 0}
          </p>
        </div>
      </div>

      {isModbusMode && state && (
        <div className="grid grid-cols-3 gap-1 mb-3">
          <div className="bg-slate-900/50 rounded px-2 py-1 text-center">
            <p className="text-[10px] text-slate-500">请求</p>
            <p className="text-sm font-mono font-semibold text-purple-400">
              {state.modbusRequestCount || 0}
            </p>
          </div>
          <div className="bg-slate-900/50 rounded px-2 py-1 text-center">
            <p className="text-[10px] text-slate-500">响应</p>
            <p className="text-sm font-mono font-semibold text-emerald-400">
              {state.modbusResponseCount || 0}
            </p>
          </div>
          <div className="bg-slate-900/50 rounded px-2 py-1 text-center">
            <p className="text-[10px] text-slate-500">超时</p>
            <p className="text-sm font-mono font-semibold text-red-400">
              {state.modbusTimeoutCount || 0}
            </p>
          </div>
        </div>
      )}

      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>最大延时</span>
          <span className="font-mono">{state?.maxSendDelay?.toFixed(0) || '-'}ms</span>
        </div>
        <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 bar-animate"
            style={{
              width: `${Math.min(((state?.maxSendDelay || 0) / 500) * 100, 100)}%`,
              backgroundColor: config.color,
            }}
          />
        </div>
        {nodeUtil && nodeUtil.utilization > 0 && (
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>总线占用率</span>
            <span className="font-mono text-cyan-400">{nodeUtil.utilization.toFixed(1)}%</span>
          </div>
        )}
      </div>

      {state && state.retryCount > 0 && (
        <div className="mb-3 flex items-center gap-2 text-xs text-orange-400">
          <span className="animate-pulse">⏳</span>
          <span>重试中: {state.retryCount} / {busConfig.maxRetries}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          className="btn btn-primary btn-sm flex-1"
          onClick={handleManualSend}
          disabled={!config.enabled || state?.status !== 'idle'}
        >
          <Play size={14} />
          {isModbusMode && config.role === 'master' ? '轮询' : '手动发送'}
        </button>
        <button
          className={`btn btn-sm ${config.enabled ? 'btn-secondary' : 'btn-success'}`}
          onClick={handleToggleEnabled}
          title={config.enabled ? '禁用节点' : '启用节点'}
        >
          <Settings size={14} />
        </button>
        <button
          className="btn btn-danger btn-sm"
          onClick={handleRemove}
          disabled={busState.isRunning}
          title="删除节点"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};
