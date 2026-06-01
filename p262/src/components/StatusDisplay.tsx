import { Hash, Hash as SequenceIcon, Shield, Clock, Layers, ArrowRightLeft } from 'lucide-react';
import { useProducerStore } from '../store/useProducerStore';

export function StatusDisplay() {
  const { status } = useProducerStore();

  const partitionEntries = status?.partitionSequences
    ? Object.entries(status.partitionSequences).sort(([a], [b]) => Number(a) - Number(b))
    : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card rounded-xl p-4 transition-all duration-300 hover:border-amber-500/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Hash className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-sm text-gray-400">生产者ID (PID)</span>
          </div>
          <div className="font-mono text-2xl font-bold text-amber-400 animate-count-up">
            {status?.pid ?? '--'}
          </div>
          <div className="text-xs text-gray-500 mt-1">Kafka 分配的唯一标识</div>
        </div>

        <div className="glass-card rounded-xl p-4 transition-all duration-300 hover:border-blue-500/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <SequenceIcon className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">最大序列号</span>
          </div>
          <div className="font-mono text-2xl font-bold text-blue-400 animate-count-up">
            {status?.currentSequence ?? '--'}
          </div>
          <div className="text-xs text-gray-500 mt-1">所有分区中的最大序列号</div>
        </div>

        <div className="glass-card rounded-xl p-4 transition-all duration-300 hover:border-green-500/50">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${
              status?.enableIdempotence ? 'bg-green-500/20' : 'bg-gray-500/20'
            }`}>
              <Shield className={`w-5 h-5 ${
                status?.enableIdempotence ? 'text-green-400' : 'text-gray-400'
              }`} />
            </div>
            <span className="text-sm text-gray-400">幂等性</span>
          </div>
          <div className={`text-2xl font-bold ${
            status?.enableIdempotence ? 'text-green-400' : 'text-gray-400'
          }`}>
            {status?.enableIdempotence ? '已开启' : '已关闭'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {status?.enableIdempotence ? 'enable.idempotence = true' : 'enable.idempotence = false'}
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 transition-all duration-300 hover:border-purple-500/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Clock className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-sm text-gray-400">纪元 (Epoch)</span>
          </div>
          <div className="font-mono text-2xl font-bold text-purple-400 animate-count-up">
            {status?.epoch ?? '--'}
          </div>
          <div className="text-xs text-gray-500 mt-1">生产者会话标识</div>
        </div>

        <div className={`glass-card rounded-xl p-4 transition-all duration-300 ${
          status?.activeTransaction ? 'border-emerald-500/50 animate-pulse-glow' : 'hover:border-slate-500/50'
        }`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${
              status?.activeTransaction ? 'bg-emerald-500/20' : 'bg-slate-500/20'
            }`}>
              <ArrowRightLeft className={`w-5 h-5 ${
                status?.activeTransaction ? 'text-emerald-400' : 'text-gray-400'
              }`} />
            </div>
            <span className="text-sm text-gray-400">事务状态</span>
          </div>
          <div className={`text-lg font-bold ${
            status?.activeTransaction ? 'text-emerald-400' : 'text-gray-500'
          }`}>
            {status?.activeTransaction ? status.activeTransaction.phase : '无活跃事务'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {status?.transactionalId ? `transactional.id = ${status.transactionalId}` : '未配置事务'}
          </div>
        </div>
      </div>

      {partitionEntries.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-5 h-5 text-cyan-400" />
            <span className="text-sm font-medium text-gray-300">各分区独立序列号</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {partitionEntries.map(([partition, sequence]) => (
              <div
                key={partition}
                className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50 hover:border-cyan-500/50 transition-all"
              >
                <div className="text-xs text-gray-400 mb-1">分区 {partition}</div>
                <div className="font-mono text-xl font-bold text-cyan-400">
                  {sequence}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
