import NodeStatus from '@/components/NodeStatus';
import QueryPanel from '@/components/QueryPanel';
import QueryResult from '@/components/QueryResult';
import QueryLogs from '@/components/QueryLogs';
import RoutingTableView from '@/components/RoutingTableView';
import SimulatedNodesList from '@/components/SimulatedNodesList';

export default function Home() {
  return (
    <div className="min-h-screen bg-cyber-bg">
      <header className="border-b border-cyber-border bg-cyber-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyber-green/10 border border-cyber-green/30 flex items-center justify-center">
            <span className="text-cyber-green font-mono text-sm font-bold">D</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-cyber-text font-sans">DHT KRPC 模拟器</h1>
            <p className="text-xs text-cyber-muted font-mono">BitTorrent DHT 协议可视化</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <NodeStatus />
            <QueryPanel />
            <SimulatedNodesList />
          </div>

          <div className="lg:col-span-8 space-y-6">
            <QueryResult />
            <RoutingTableView />
            <QueryLogs />
          </div>
        </div>
      </main>
    </div>
  );
}
