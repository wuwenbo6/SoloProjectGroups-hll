import { Plus, Trash2, Send, Play, RotateCcw, Clock, AlertTriangle, Cpu } from 'lucide-react';
import type { BusNode } from '../types/bus';
import { useBusStore } from '../store/busStore';
import { cn } from '../lib/utils';

interface NodePanelProps {
  onStartSimulation: () => void;
}

export default function NodePanel({ onStartSimulation }: NodePanelProps) {
  const {
    nodes,
    selectedNodeIds,
    isSimulating,
    addNode,
    removeNode,
    updateNode,
    toggleNodeSelection,
    selectAllNodes,
    clearSelection,
    resetSimulation,
    nodeBackoffCounts,
    nodeBackoffDelays,
    useModbus,
    toggleUseModbus,
  } = useBusStore();

  const getStatusBadge = (status: BusNode['status']) => {
    const styles = {
      idle: 'bg-[#1a2332] text-[#667788]',
      sending: 'bg-[#00d4ff]/20 text-[#00d4ff]',
      collision: 'bg-[#ef4444]/20 text-[#ef4444]',
      won: 'bg-[#10b981]/20 text-[#10b981]',
      lost: 'bg-[#f59e0b]/20 text-[#f59e0b]',
      backoff: 'bg-[#8b5cf6]/20 text-[#8b5cf6]',
    };
    const labels = {
      idle: '空闲',
      sending: '发送中',
      collision: '冲突',
      won: '获胜',
      lost: '丢失',
      backoff: '退避中',
    };
    return (
      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', styles[status])}>
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#00d4ff]">节点控制</h2>
        <div className="flex gap-2">
          <button
            onClick={selectAllNodes}
            disabled={nodes.length === 0}
            className="px-3 py-1.5 text-xs rounded border border-[#1a2332] bg-[#0f1623] text-[#8899aa] hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            全选
          </button>
          <button
            onClick={clearSelection}
            disabled={selectedNodeIds.length === 0}
            className="px-3 py-1.5 text-xs rounded border border-[#1a2332] bg-[#0f1623] text-[#8899aa] hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            清除
          </button>
        </div>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
        {nodes.map(node => (
          <div
            key={node.id}
            className={cn(
              'p-3 rounded-lg border transition-all',
              selectedNodeIds.includes(node.id)
                ? 'border-[#00d4ff] bg-[#00d4ff]/5 shadow-[0_0_15px_rgba(0,212,255,0.1)]'
                : 'border-[#1a2332] bg-[#0f1623] hover:border-[#2a3a4e]'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: node.color, boxShadow: `0 0 8px ${node.color}` }}
                />
                <input
                  type="text"
                  value={node.name}
                  onChange={e => updateNode(node.id, { name: e.target.value })}
                  className="bg-transparent text-sm font-medium text-[#e0e6ed] w-20 outline-none border-b border-transparent focus:border-[#00d4ff]/50"
                />
                {getStatusBadge(node.status)}
              </div>
              <button
                onClick={() => removeNode(node.id)}
                disabled={nodes.length <= 1}
                className="p-1 text-[#667788] hover:text-[#ef4444] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-xs text-[#667788] mb-1 block">地址 (Hex)</label>
                <input
                  type="text"
                  value={node.address.toString(16).padStart(2, '0').toUpperCase()}
                  onChange={e => {
                    const val = parseInt(e.target.value, 16);
                    if (!isNaN(val) && val >= 0 && val <= 255) {
                      updateNode(node.id, { address: val });
                    }
                  }}
                  className="w-full px-2 py-1 text-xs bg-[#0a0e17] border border-[#1a2332] rounded text-[#00d4ff] font-mono outline-none focus:border-[#00d4ff]"
                />
              </div>
              <div>
                <label className="text-xs text-[#667788] mb-1 block">优先级</label>
                <div className="w-full px-2 py-1 text-xs bg-[#0a0e17] border border-[#1a2332] rounded text-[#10b981] font-mono">
                  {256 - node.address}
                </div>
              </div>
            </div>

            <div className="mb-2">
              <label className="text-xs text-[#667788] mb-1 block">发送数据 (Hex)</label>
              <input
                type="text"
                value={node.data}
                onChange={e => {
                  const val = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
                  updateNode(node.id, { data: val.slice(0, 8) });
                }}
                className="w-full px-2 py-1 text-xs bg-[#0a0e17] border border-[#1a2332] rounded text-[#e0e6ed] font-mono outline-none focus:border-[#00d4ff]"
                placeholder="例如: A5"
              />
            </div>

            {(nodeBackoffCounts[node.id] > 0 || node.status === 'backoff') && (
              <div className="mb-2 p-2 rounded bg-[#8b5cf6]/10 border border-[#8b5cf6]/30">
                <div className="flex items-center gap-2 text-xs text-[#8b5cf6]">
                  <Clock size={12} />
                  <span>退避计数: {nodeBackoffCounts[node.id] || 0}</span>
                  {nodeBackoffDelays[node.id] !== undefined && (
                    <span>等待: {nodeBackoffDelays[node.id]} 时隙</span>
                  )}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedNodeIds.includes(node.id)}
                onChange={() => toggleNodeSelection(node.id)}
                className="w-4 h-4 rounded border-[#1a2332] bg-[#0a0e17] text-[#00d4ff] focus:ring-[#00d4ff] focus:ring-offset-0"
              />
              <span className="text-xs text-[#8899aa]">参与发送</span>
            </label>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="p-3 rounded-lg bg-[#0a0e17] border border-[#1a2332]">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <Cpu size={14} className={useModbus ? 'text-[#00d4ff]' : 'text-[#667788]'} />
              <span className={cn('text-sm', useModbus ? 'text-[#00d4ff]' : 'text-[#8899aa]')}>
                Modbus RTU 帧封装
              </span>
            </div>
            <div
              className={cn(
                'w-10 h-5 rounded-full transition-colors relative',
                useModbus ? 'bg-[#00d4ff]' : 'bg-[#1a2332]'
              )}
            >
              <div
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-[#0a0e17] transition-transform',
                  useModbus ? 'translate-x-5' : 'translate-x-0.5'
                )}
              />
            </div>
          </label>
          <p className="text-xs text-[#667788] mt-1 pl-6">
            {useModbus ? 'CRC16校验 + 标准RTU帧格式' : '简化帧格式，无CRC校验'}
          </p>
        </div>

        <button
          onClick={addNode}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-dashed border-[#1a2332] bg-[#0f1623] text-[#667788] hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors"
        >
          <Plus size={16} />
          添加节点
        </button>

        <div className="flex gap-2">
          <button
            onClick={onStartSimulation}
            disabled={selectedNodeIds.length === 0 || isSimulating}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all',
              selectedNodeIds.length > 0 && !isSimulating
                ? 'bg-[#00d4ff] text-[#0a0e17] hover:bg-[#00b8d9] shadow-[0_0_20px_rgba(0,212,255,0.3)]'
                : 'bg-[#1a2332] text-[#667788] cursor-not-allowed'
            )}
          >
            {isSimulating ? (
              <><Play size={16} className="animate-pulse" /> 模拟中...</>
            ) : (
              <><Send size={16} /> 开始模拟 ({selectedNodeIds.length})</>
            )}
          </button>
          <button
            onClick={resetSimulation}
            className="px-4 py-2.5 rounded-lg border border-[#1a2332] bg-[#0f1623] text-[#667788] hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-[#0a0e17] border border-[#1a2332]">
        <div className="flex items-center gap-2 text-xs text-[#667788] mb-2">
          <AlertTriangle size={12} className="text-[#f59e0b]" />
          <span>指数退避说明</span>
        </div>
        <p className="text-xs text-[#8899aa] leading-relaxed">
          冲突后丢失仲裁的节点将进入指数退避状态，等待随机时隙后重试。
          第n次冲突后等待范围: 0 ~ 2<sup>n</sup>-1 个时隙。
        </p>
      </div>
    </div>
  );
}
