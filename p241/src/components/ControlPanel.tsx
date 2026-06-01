import { useSimulationStore } from "@/store/simulationStore";
import { getExportUrl } from "@/api/simulation";
import { Play, Loader2, RotateCcw, Minus, Plus, Download } from "lucide-react";
import { PcieVersion, NumaMode } from "@/types";

const ITERATION_OPTIONS = [50, 100, 200, 500, 1000];
const PCIE_OPTIONS: { value: PcieVersion; label: string; bw: number }[] = [
  { value: "gen3", label: "PCIe 3.0 x16", bw: 15.75 },
  { value: "gen4", label: "PCIe 4.0 x16", bw: 32.0 },
];
const NUMA_OPTIONS: { value: NumaMode; label: string; desc: string }[] = [
  { value: "local", label: "NUMA 本地", desc: "同 Socket，无额外开销" },
  { value: "remote", label: "NUMA 远程", desc: "跨 Socket，延迟 ×1.6，带宽 -15%" },
  { value: "auto", label: "自动混合", desc: "混合访问，延迟 ×1.25，带宽 -7%" },
];

export default function ControlPanel() {
  const {
    iterations,
    includeTraditional,
    pcieVersion,
    gpuCount,
    numaMode,
    loading,
    data,
    setIterations,
    setIncludeTraditional,
    setPcieVersion,
    setGpuCount,
    setNumaMode,
    runSimulation,
  } = useSimulationStore();

  const exportUrl = getExportUrl(iterations, includeTraditional, pcieVersion, gpuCount, numaMode);

  return (
    <div className="glow-border rounded-xl bg-cyber-card p-5 transition-all duration-300">
      <h2 className="mb-4 font-mono text-sm font-semibold tracking-wider text-cyber-accent uppercase">
        模拟控制
      </h2>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block font-mono text-xs text-cyber-muted">
            PCIe 版本
          </label>
          <div className="space-y-1.5">
            {PCIE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPcieVersion(opt.value)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 font-mono text-xs transition-all duration-200 ${
                  pcieVersion === opt.value
                    ? "bg-cyber-blue/20 text-cyber-blue"
                    : "bg-cyber-bg text-cyber-muted hover:text-cyber-fg"
                }`}
              >
                <span>{opt.label}</span>
                <span className="opacity-70">{opt.bw} GB/s</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-mono text-xs text-cyber-muted">
            GPU 数量 (共通 PCIe 通道)
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGpuCount(gpuCount - 1)}
              disabled={gpuCount <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyber-bg text-cyber-muted transition-all duration-200 hover:text-cyber-fg disabled:opacity-30"
            >
              <Minus className="h-3 w-3" />
            </button>
            <div className="flex-1 text-center font-mono text-lg font-bold text-cyber-accent">
              {gpuCount}
            </div>
            <button
              onClick={() => setGpuCount(gpuCount + 1)}
              disabled={gpuCount >= 8}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyber-bg text-cyber-muted transition-all duration-200 hover:text-cyber-fg disabled:opacity-30"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <p className="mt-1 text-center font-mono text-[10px] text-cyber-muted">
            每卡可用带宽: {(PCIE_OPTIONS.find((o) => o.value === pcieVersion)?.bw ?? 32) / gpuCount} GB/s
          </p>
        </div>

        <div>
          <label className="mb-1.5 block font-mono text-xs text-cyber-muted">
            NUMA 亲和性
          </label>
          <div className="space-y-1.5">
            {NUMA_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setNumaMode(opt.value)}
                className={`w-full rounded-lg px-3 py-2 text-left font-mono text-xs transition-all duration-200 ${
                  numaMode === opt.value
                    ? "bg-cyber-purple/20 text-cyber-purple"
                    : "bg-cyber-bg text-cyber-muted hover:text-cyber-fg"
                }`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="mt-0.5 text-[10px] opacity-60">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-mono text-xs text-cyber-muted">
            迭代次数
          </label>
          <div className="flex flex-wrap gap-2">
            {ITERATION_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setIterations(opt)}
                className={`rounded-lg px-3 py-1.5 font-mono text-xs transition-all duration-200 ${
                  iterations === opt
                    ? "bg-cyber-accent text-cyber-bg shadow-[0_0_12px_rgba(34,211,238,0.4)]"
                    : "bg-cyber-bg text-cyber-muted hover:text-cyber-fg"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block font-mono text-xs text-cyber-muted">
            传输路径对比
          </label>
          <button
            onClick={() => setIncludeTraditional(!includeTraditional)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-xs transition-all duration-200 ${
              includeTraditional
                ? "bg-cyber-blue/20 text-cyber-blue"
                : "bg-cyber-bg text-cyber-muted"
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                includeTraditional ? "bg-cyber-blue" : "bg-cyber-border"
              }`}
            />
            传统 CPU 中转路径
          </button>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={runSimulation}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyber-accent px-4 py-2.5 font-mono text-sm font-semibold text-cyber-bg transition-all duration-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.5)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {loading ? "模拟中..." : "开始模拟"}
          </button>

          {data && (
            <button
              onClick={runSimulation}
              disabled={loading}
              className="flex items-center justify-center rounded-lg bg-cyber-bg px-3 py-2.5 text-cyber-muted transition-all duration-200 hover:text-cyber-fg"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>

        {data && (
          <a
            href={exportUrl}
            download
            className="flex items-center justify-center gap-2 rounded-lg border border-cyber-border bg-cyber-bg px-4 py-2 font-mono text-xs text-cyber-muted transition-all duration-200 hover:border-cyber-accent hover:text-cyber-accent"
          >
            <Download className="h-3.5 w-3.5" />
            导出 JSON 结果
          </a>
        )}
      </div>

      {data && (
        <div className="mt-4 border-t border-cyber-border pt-3">
          <div className="flex items-center justify-between font-mono text-xs text-cyber-muted">
            <span>总 PCIe 带宽</span>
            <span className="text-cyber-purple">{data.config.total_bandwidth_gbps} GB/s</span>
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-xs text-cyber-muted">
            <span>每卡可用带宽</span>
            <span className="text-cyber-purple">{data.config.per_gpu_bandwidth_gbps.toFixed(2)} GB/s</span>
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-xs text-cyber-muted">
            <span>NUMA 模式</span>
            <span className="text-cyber-purple">{data.config.numa_label}</span>
          </div>
          {data.config.numa_latency_multiplier > 1.0 && (
            <div className="mt-1 flex items-center justify-between font-mono text-xs text-cyber-muted">
              <span>跨 Socket 延迟倍率</span>
              <span className="text-cyber-red">×{data.config.numa_latency_multiplier}</span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between font-mono text-xs text-cyber-muted">
            <span>报文梯度</span>
            <span className="text-cyber-accent">{data.config.packet_sizes.length} 级</span>
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-xs text-cyber-muted">
            <span>总迭代数</span>
            <span className="text-cyber-accent">
              {data.config.iterations * data.config.packet_sizes.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
