import { useEffect } from 'react';
import { Database, Info } from 'lucide-react';
import { useProducerStore } from './store/useProducerStore';
import { ControlPanel } from './components/ControlPanel';
import { StatusDisplay } from './components/StatusDisplay';
import { StatsCard } from './components/StatsCard';
import { MessageList } from './components/MessageList';
import { TransactionCoordinatorPanel } from './components/TransactionCoordinatorPanel';
import { TransactionPanel } from './components/TransactionPanel';

function App() {
  const { fetchStatus, fetchMessages, fetchPIDStates, fetchTransactions } = useProducerStore();

  useEffect(() => {
    fetchStatus();
    fetchMessages();
    fetchPIDStates();
    fetchTransactions();
  }, [fetchStatus, fetchMessages, fetchPIDStates, fetchTransactions]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl shadow-lg shadow-amber-500/25">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">
                  Kafka 幂等生产者模拟器
                </h1>
                <p className="text-sm text-gray-400">
                  Idempotent Producer Simulator
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <Info className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-300">
                enable.idempotence = true
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500/20 rounded-xl flex-shrink-0">
                <Info className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  什么是 Kafka 幂等生产者？
                </h3>
                <p className="text-gray-300 text-sm leading-relaxed">
                  幂等生产者通过为每条消息分配一个唯一的 <span className="font-mono text-amber-400">PID（生产者ID）</span> 和 
                  <span className="font-mono text-blue-400"> 序列号（Sequence Number）</span> 来实现生产端去重。
                  <strong className="text-cyan-300">每个分区独立维护自己的序列号</strong>，
                  <span className="font-mono text-cyan-400"> Transaction Coordinator</span> 跨分区存储所有 PID 状态。
                  去重检查基于 <span className="font-mono bg-cyan-500/20 px-1 rounded text-cyan-300">PID + Partition + Sequence</span> 三元组，
                  当收到重复消息时会自动丢弃，从而保证消息在生产端不会重复。
                </p>
              </div>
            </div>
          </div>

          <StatusDisplay />

          <StatsCard />

          <TransactionCoordinatorPanel />

          <TransactionPanel />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <ControlPanel />
            </div>
            <div className="lg:col-span-2">
              <MessageList />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-700/50 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              Kafka 幂等生产者模拟器 - 用于学习和演示 Kafka 幂等性机制
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <span>PID + Partition + Sequence → 唯一键</span>
              <span>•</span>
              <span>分区独立序列号</span>
              <span>•</span>
              <span>Exactly-Once 语义基础</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
