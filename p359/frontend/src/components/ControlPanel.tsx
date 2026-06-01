import { Play, Square, Zap, ZapOff, Settings, AlertTriangle, RefreshCw, XCircle, Download, HeartCrack } from 'lucide-react';
import { OAMState, NodeConfig, LoopbackMode, CriticalEventCause, DyingGaspCause, ExportFormat } from '../types';
import { StatusIndicator } from './StatusIndicator';
import { getStatusColor } from '../utils/formatters';

interface ControlPanelProps {
  state: OAMState;
  isConnected: boolean;
  onStart: () => void;
  onStop: () => void;
  onTriggerFault: () => void;
  onClearFault: () => void;
  onConfigureNode: (nodeId: string, config: Partial<NodeConfig>) => void;
  onSetLoopbackMode: (nodeId: string, loopbackMode: LoopbackMode) => void;
  onSendCriticalEvent: (nodeId: string, cause: CriticalEventCause, causeText: string) => void;
  onSendDyingGasp: (nodeId: string, cause: DyingGaspCause, causeText: string) => void;
  onExportEvents: (format: ExportFormat) => void;
}

export function ControlPanel({
  state,
  isConnected,
  onStart,
  onStop,
  onTriggerFault,
  onClearFault,
  onConfigureNode,
  onSetLoopbackMode,
  onSendCriticalEvent,
  onSendDyingGasp,
  onExportEvents,
}: ControlPanelProps) {
  const handleModeChange = (nodeId: string, mode: 'active' | 'passive') => {
    onConfigureNode(nodeId, { mode });
  };

  const handleMacChange = (nodeId: string, mac: string) => {
    onConfigureNode(nodeId, { mac_address: mac });
  };

  const handleLoopbackChange = (nodeId: string, loopbackMode: LoopbackMode) => {
    onSetLoopbackMode(nodeId, loopbackMode);
  };

  const handleSendCriticalEvent = (nodeId: string) => {
    onSendCriticalEvent(nodeId, 'port_state_change', 'Test critical event from UI');
  };

  const handleSendDyingGasp = (nodeId: string) => {
    onSendDyingGasp(nodeId, 'power_failure', 'Dying Gasp - Power failure detected');
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">控制面板</h2>
        <StatusIndicator
          status={isConnected ? 'up' : 'down'}
          label={isConnected ? '已连接' : '未连接'}
          size="sm"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={onStart}
          disabled={state.simulation_running}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/20"
        >
          <Play className="w-4 h-4" />
          启动模拟
        </button>
        <button
          onClick={onStop}
          disabled={!state.simulation_running}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all duration-200"
        >
          <Square className="w-4 h-4" />
          停止模拟
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onTriggerFault}
          disabled={!state.simulation_running || state.link_status === 'fault'}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all duration-200 hover:shadow-lg hover:shadow-red-500/20"
        >
          <AlertTriangle className="w-4 h-4" />
          触发故障
        </button>
        <button
          onClick={onClearFault}
          disabled={!state.simulation_running || state.link_status !== 'fault'}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all duration-200"
        >
          <ZapOff className="w-4 h-4" />
          清除故障
        </button>
      </div>

      <div className="h-px bg-slate-700/50 my-1" />

      <div className="flex items-center gap-2 mb-1">
        <Settings className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-medium text-slate-300">节点配置</h3>
      </div>

      {state.nodes.map((node) => (
        <div
          key={node.id}
          className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-slate-200">{node.name}</span>
            <StatusIndicator
              status={node.mode}
              label={node.mode === 'active' ? '主动模式' : '被动模式'}
              size="sm"
            />
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">MAC 地址</label>
              <input
                type="text"
                value={node.mac_address}
                onChange={(e) => handleMacChange(node.id, e.target.value)}
                disabled={state.simulation_running}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">工作模式</label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleModeChange(node.id, 'active')}
                  disabled={state.simulation_running}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    node.mode === 'active'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Zap className="inline w-3 h-3 inline mr-1" />
                  主动
                </button>
                <button
                  onClick={() => handleModeChange(node.id, 'passive')}
                  disabled={state.simulation_running}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    node.mode === 'passive'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  被动
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">环回模式</label>
              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={() => handleLoopbackChange(node.id, 'none')}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    node.loopback_mode === 'none'
                      ? 'bg-slate-600 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  关闭
                </button>
                <button
                  onClick={() => handleLoopbackChange(node.id, 'local_loopback')}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    node.loopback_mode === 'local_loopback'
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  本地
                </button>
                <button
                  onClick={() => handleLoopbackChange(node.id, 'remote_loopback')}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    node.loopback_mode === 'remote_loopback'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  远端
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="h-px bg-slate-700/50 my-1" />

      <div className="flex items-center gap-2 mb-1">
        <XCircle className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-medium text-slate-300">事件控制</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {state.nodes.map((node) => (
          <button
            key={`critical-${node.id}`}
            onClick={() => handleSendCriticalEvent(node.id)}
            disabled={!state.simulation_running}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600/80 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium transition-all duration-200"
          >
            <AlertTriangle className="w-3 h-3" />
            {node.name} Critical事件
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        {state.nodes.map((node) => (
          <button
            key={`dying-gasp-${node.id}`}
            onClick={() => handleSendDyingGasp(node.id)}
            disabled={!state.simulation_running}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-700/80 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium transition-all duration-200"
          >
            <HeartCrack className="w-3 h-3" />
            {node.name} Dying Gasp
          </button>
        ))}
      </div>

      <div className="h-px bg-slate-700/50 my-1" />

      <div className="flex items-center gap-2 mb-1">
        <Download className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-medium text-slate-300">事件日志导出</h3>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onExportEvents('json')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600/80 hover:bg-emerald-500 rounded-lg text-xs font-medium transition-all duration-200"
        >
          <Download className="w-3 h-3" />
          导出 JSON
        </button>
        <button
          onClick={() => onExportEvents('csv')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600/80 hover:bg-blue-500 rounded-lg text-xs font-medium transition-all duration-200"
        >
          <Download className="w-3 h-3" />
          导出 CSV
        </button>
      </div>

      <div className="h-px bg-slate-700/50 my-1" />

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">Discovery 状态</div>
          <div className={`text-sm font-semibold ${getStatusColor(state.discovery_state)}`}>
            {state.discovery_state === 'idle' && '空闲'}
            {state.discovery_state === 'in_progress' && '进行中'}
            {state.discovery_state === 'completed' && '已完成'}
            {state.discovery_state === 'failed' && '失败'}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">链路状态</div>
          <div className={`text-sm font-semibold ${getStatusColor(state.link_status)}`}>
            {state.link_status === 'up' && '正常'}
            {state.link_status === 'down' && '断开'}
            {state.link_status === 'fault' && '故障'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">本地状态</div>
          <div className="text-sm font-semibold text-slate-200">{state.local_state}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400 mb-1">远端状态</div>
          <div className="text-sm font-semibold text-slate-200">{state.remote_state}</div>
        </div>
      </div>
    </div>
  );
}
