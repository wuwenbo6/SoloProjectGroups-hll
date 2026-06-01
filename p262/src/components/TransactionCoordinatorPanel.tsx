import { Database, RefreshCw, Hash, Layers, Clock } from 'lucide-react';
import { useProducerStore } from '../store/useProducerStore';
import type { PIDState } from '../../shared/types';

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function PIDStateCard({ pidState }: { pidState: PIDState }) {
  const partitionEntries = Object.entries(pidState.partitions).sort(
    ([a], [b]) => Number(a) - Number(b)
  );

  return (
    <div className="glass-card rounded-xl p-4 border border-slate-700/50 hover:border-cyan-500/30 transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-cyan-500/20 rounded-lg">
            <Hash className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="font-mono text-lg font-bold text-cyan-400">
              PID: {pidState.pid}
            </div>
            <div className="text-xs text-gray-500">Epoch: {pidState.epoch}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Clock className="w-3 h-3" />
          <span>创建时间: {formatTime(pidState.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <RefreshCw className="w-3 h-3" />
          <span>最后使用: {formatTime(pidState.lastUsedAt)}</span>
        </div>

        {partitionEntries.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs font-medium text-gray-300">分区状态</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {partitionEntries.map(([partition, state]) => (
                <div
                  key={partition}
                  className="bg-slate-800/50 rounded-lg p-2 text-center"
                >
                  <div className="text-xs text-gray-500">分区 {partition}</div>
                  <div className="font-mono text-sm font-bold text-cyan-400">
                    Seq: {state.lastSequence}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TransactionCoordinatorPanel() {
  const { pidStates } = useProducerStore();

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-400" />
          Transaction Coordinator
        </h2>
        <span className="text-sm text-gray-400">
          共 {pidStates.length} 个 PID 状态
        </span>
      </div>

      <div className="mb-4 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
        <p className="text-sm text-cyan-200">
          <strong>工作原理:</strong> Transaction Coordinator 跨分区维护所有 PID 的状态信息。
          每个分区独立维护自己的序列号，去重检查基于 <code className="font-mono bg-cyan-500/20 px-1 rounded">PID + Partition + Sequence</code> 三元组。
        </p>
      </div>

      {pidStates.length === 0 ? (
        <div className="text-center py-8">
          <Database className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-gray-500">暂无 PID 状态记录</p>
          <p className="text-sm text-gray-600 mt-1">发送消息后将在此处显示</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pidStates.map((state) => (
            <PIDStateCard key={state.pid} pidState={state} />
          ))}
        </div>
      )}
    </div>
  );
}
