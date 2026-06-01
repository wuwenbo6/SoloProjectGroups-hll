import { useSimulationStore } from "@/store/simulationStore";
import { Cpu, Network, Zap, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

interface Particle {
  id: number;
  offset: number;
  speed: number;
  size: number;
}

export default function TransferAnimation() {
  const { data, loading, numaMode } = useSimulationStore();
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!loading && !data) return;
    const interval = setInterval(() => {
      setParticles((prev) => {
        const next = prev
          .map((p) => ({ ...p, offset: p.offset + p.speed }))
          .filter((p) => p.offset < 100);
        if (Math.random() > 0.5) {
          next.push({
            id: Date.now() + Math.random(),
            offset: 0,
            speed: 2 + Math.random() * 3,
            size: 2 + Math.random() * 3,
          });
        }
        return next.slice(-20);
      });
    }, 50);
    return () => clearInterval(interval);
  }, [loading, data]);

  const isActive = loading || !!data;
  const gpuCount = data?.config.gpu_count ?? 1;
  const currentNuma = data?.config.numa_mode ?? numaMode;
  const isRemote = currentNuma === "remote";
  const isAuto = currentNuma === "auto";

  return (
    <div className="glow-border animate-slide-up rounded-xl bg-cyber-card p-5 transition-all duration-300">
      <h2 className="mb-4 font-mono text-sm font-semibold tracking-wider text-cyber-accent uppercase">
        数据传输路径
      </h2>

      <div className="flex items-center justify-between gap-3 py-4">
        <div className="flex flex-col items-center gap-1.5">
          <div className="grid grid-cols-2 gap-1">
            {Array.from({ length: Math.min(gpuCount, 4) }).map((_, i) => (
              <div
                key={i}
                className={`flex h-7 w-7 items-center justify-center rounded-md ${
                  isActive
                    ? "bg-cyber-green/20 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                    : "bg-cyber-bg"
                } transition-all duration-500`}
              >
                <Cpu className={`h-4 w-4 ${isActive ? "text-cyber-green" : "text-cyber-muted"}`} />
              </div>
            ))}
          </div>
          {gpuCount > 4 && (
            <span className="font-mono text-[10px] text-cyber-muted">+{gpuCount - 4} GPUs</span>
          )}
          <span className="font-mono text-xs text-cyber-muted">
            {gpuCount === 1 ? "GPU" : `${gpuCount}x GPUs`}
          </span>
        </div>

        {(isRemote || isAuto) && (
          <div className="flex flex-col items-center gap-1">
            <div className={`flex h-8 w-8 items-center justify-center rounded-md ${
              isActive && isRemote
                ? "bg-cyber-red/20 shadow-[0_0_8px_rgba(239,68,68,0.3)]"
                : isActive && isAuto
                ? "bg-cyber-orange/20 shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                : "bg-cyber-bg"
            } transition-all duration-500`}>
              <Zap className={`h-4 w-4 ${
                isRemote ? (isActive ? "text-cyber-red" : "text-cyber-muted")
                : (isActive ? "text-cyber-orange" : "text-cyber-muted")
              }`} />
            </div>
            <span className="font-mono text-[9px] text-cyber-muted text-center leading-tight">
              QPI/UPI<br />跨Socket
            </span>
          </div>
        )}

        <div className="relative flex-1 overflow-hidden rounded-full bg-cyber-bg px-1 py-2">
          <div className="absolute inset-0 flex items-center">
            <div
              className={`h-px w-full ${
                isRemote
                  ? "bg-gradient-to-r from-cyber-red via-cyber-accent to-cyber-blue"
                  : isAuto
                  ? "bg-gradient-to-r from-cyber-orange via-cyber-accent to-cyber-blue"
                  : "bg-gradient-to-r from-cyber-green via-cyber-accent to-cyber-blue"
              } transition-all duration-500`}
            />
          </div>
          {isActive &&
            particles.map((p) => (
              <div
                key={p.id}
                className="absolute top-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${p.offset}%`,
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  background: isRemote
                    ? `hsl(${0 + p.offset * 1.8}, 80%, 60%)`
                    : `hsl(${180 + p.offset * 0.5}, 80%, 60%)`,
                  boxShadow: isRemote
                    ? `0 0 ${p.size * 2}px hsl(${0 + p.offset * 1.8}, 80%, 60%)`
                    : `0 0 ${p.size * 2}px hsl(${180 + p.offset * 0.5}, 80%, 60%)`,
                }}
              />
            ))}
          <div className="relative flex justify-between px-1">
            <ArrowRight className="h-3 w-3 text-cyber-muted" />
            <span className="font-mono text-[10px] text-cyber-muted">
              PCIe {data?.config.pcie_version === "gen3" ? "3.0" : "4.0"} x16
            </span>
            <Zap className="h-3 w-3 text-cyber-muted" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-xl ${
              isActive
                ? "bg-cyber-blue/20 shadow-[0_0_16px_rgba(59,130,246,0.3)]"
                : "bg-cyber-bg"
            } transition-all duration-500`}
          >
            <Network className={`h-7 w-7 ${isActive ? "text-cyber-blue" : "text-cyber-muted"}`} />
          </div>
          <span className="font-mono text-xs text-cyber-muted">NIC</span>
        </div>
      </div>

      <div className="mt-2 flex flex-col items-center gap-2 font-mono text-[10px] text-cyber-muted">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyber-green" />
            GPUDirect RDMA 零拷贝
          </span>
          {data && data.traditional_results.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyber-orange" />
              传统路径需 CPU 中转
            </span>
          )}
          {isRemote && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyber-red" />
              跨 Socket 访问
            </span>
          )}
        </div>
        {data && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span>总带宽: <span className="text-cyber-purple">{data.config.total_bandwidth_gbps} GB/s</span></span>
            <span>每卡: <span className="text-cyber-purple">{data.config.per_gpu_bandwidth_gbps.toFixed(2)} GB/s</span></span>
            {data.config.numa_latency_multiplier > 1.0 && (
              <span>NUMA 延迟: <span className="text-cyber-red">×{data.config.numa_latency_multiplier}</span></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
