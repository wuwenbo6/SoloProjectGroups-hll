import ControlPanel from "@/components/ControlPanel";
import ThroughputChart from "@/components/ThroughputChart";
import ComparisonChart from "@/components/ComparisonChart";
import LatencyTable from "@/components/LatencyTable";
import TransferAnimation from "@/components/TransferAnimation";
import { useSimulationStore } from "@/store/simulationStore";
import { Activity, Cpu, Network, Gauge } from "lucide-react";

export default function Home() {
  const { data, loading, error } = useSimulationStore();

  const stats = data
    ? {
        maxBw: Math.max(...data.rdma_results.map((r) => r.avg_bandwidth_gbps)),
        minLat: Math.min(...data.rdma_results.map((r) => r.avg_latency_us)),
        avgGain:
          data.traditional_results.length > 0
            ? (
                data.rdma_results.reduce((sum, r, i) => {
                  const t = data.traditional_results[i];
                  return sum + ((r.avg_bandwidth_gbps - t.avg_bandwidth_gbps) / t.avg_bandwidth_gbps) * 100;
                }, 0) / data.rdma_results.length
              ).toFixed(1)
            : null,
        packetCount: data.config.packet_sizes.length,
      }
    : null;

  return (
    <div className="min-h-screen bg-cyber-bg font-sans">
      <header className="border-b border-cyber-border bg-cyber-card/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyber-accent/10">
              <Activity className="h-5 w-5 text-cyber-accent" />
            </div>
            <div>
              <h1 className="font-mono text-base font-bold text-cyber-fg">
                GPUDirect RDMA 模拟器
              </h1>
              <p className="font-mono text-[10px] text-cyber-muted">
                GPU ↔ NIC 零拷贝数据传输性能仿真
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-cyber-green animate-pulse" />
            <span className="font-mono text-xs text-cyber-muted">模拟模式</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="glow-border rounded-xl bg-cyber-card p-4 transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="h-4 w-4 text-cyber-accent" />
                <span className="font-mono text-xs text-cyber-muted">峰值吞吐量</span>
              </div>
              <p className="font-mono text-xl font-bold text-cyber-accent">
                {stats.maxBw.toFixed(1)} <span className="text-xs text-cyber-muted">GB/s</span>
              </p>
            </div>
            <div className="glow-border rounded-xl bg-cyber-card p-4 transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="h-4 w-4 text-cyber-green" />
                <span className="font-mono text-xs text-cyber-muted">最低延迟</span>
              </div>
              <p className="font-mono text-xl font-bold text-cyber-green">
                {stats.minLat.toFixed(3)} <span className="text-xs text-cyber-muted">μs</span>
              </p>
            </div>
            {stats.avgGain && (
              <div className="glow-border rounded-xl bg-cyber-card p-4 transition-all duration-300">
                <div className="flex items-center gap-2 mb-2">
                  <Network className="h-4 w-4 text-cyber-purple" />
                  <span className="font-mono text-xs text-cyber-muted">RDMA 平均提升</span>
                </div>
                <p className="font-mono text-xl font-bold text-cyber-purple">
                  +{stats.avgGain}%
                </p>
              </div>
            )}
            <div className="glow-border rounded-xl bg-cyber-card p-4 transition-all duration-300">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-cyber-orange" />
                <span className="font-mono text-xs text-cyber-muted">报文梯度数</span>
              </div>
              <p className="font-mono text-xl font-bold text-cyber-orange">
                {stats.packetCount} <span className="text-xs text-cyber-muted">级</span>
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-6">
            <ControlPanel />
            <TransferAnimation />
          </div>

          <div className="space-y-6">
            {loading && (
              <div className="flex items-center justify-center gap-3 rounded-xl bg-cyber-card p-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyber-accent border-t-transparent" />
                <span className="font-mono text-sm text-cyber-muted">
                  正在执行 RDMA 传输模拟...
                </span>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-cyber-red/30 bg-cyber-red/10 p-4 font-mono text-sm text-cyber-red">
                模拟失败: {error}
              </div>
            )}

            {!loading && !data && !error && (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-cyber-card p-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyber-accent/10">
                  <Activity className="h-8 w-8 text-cyber-accent" />
                </div>
                <p className="font-mono text-sm text-cyber-muted">
                  设置参数后点击「开始模拟」查看结果
                </p>
              </div>
            )}

            {data && !loading && (
              <>
                <ThroughputChart />
                <ComparisonChart />
                <LatencyTable />
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-12 border-t border-cyber-border py-4 text-center font-mono text-xs text-cyber-muted">
        GPUDirect RDMA Simulator v1.0 — 基于 PCIe Gen4 x16 理论模型仿真
      </footer>
    </div>
  );
}
