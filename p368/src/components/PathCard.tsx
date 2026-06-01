import type { PathStatus } from "@/types"
import { Wifi, WifiOff, Activity } from "lucide-react"

interface PathCardProps {
  path: PathStatus
}

export default function PathCard({ path }: PathCardProps) {
  const isActive = path.active
  const isConnected = path.connected

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border p-5 transition-all duration-300
        ${
          isActive
            ? "border-cyber-cyan/50 bg-cyber-surface shadow-lg animate-pulse_glow"
            : isConnected
            ? "border-cyber-border bg-cyber-surface"
            : "border-cyber-red/30 bg-cyber-surface/50 opacity-60"
        }
      `}
    >
      {isActive && (
        <div className="absolute inset-0 bg-gradient-to-br from-cyber-cyan/5 to-transparent pointer-events-none" />
      )}

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Wifi className={`w-5 h-5 ${isActive ? "text-cyber-cyan" : "text-cyber-muted"}`} />
            ) : (
              <WifiOff className="w-5 h-5 text-cyber-red" />
            )}
            <span className="font-mono font-semibold text-lg tracking-wide">
              {path.id === "pathA" ? "Path A" : "Path B"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-cyber-surface/60 text-cyber-muted rounded-full border border-cyber-border">
              PRI={path.priority}
            </span>
            {isActive && (
              <span className="px-2 py-0.5 text-xs font-mono font-bold bg-cyber-cyan/20 text-cyber-cyan rounded-full border border-cyber-cyan/30">
                ACTIVE
              </span>
            )}
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected
                  ? isActive
                    ? "bg-cyber-cyan shadow-[0_0_8px_rgba(0,240,255,0.8)]"
                    : "bg-cyber-green"
                  : "bg-cyber-red shadow-[0_0_6px_rgba(255,51,85,0.6)]"
              }`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 font-mono text-sm">
          <div>
            <div className="text-cyber-muted text-xs mb-0.5">Latency</div>
            <div className={isConnected ? "text-slate-200" : "text-cyber-muted line-through"}>
              {isConnected ? `${path.latency_ms} ms` : "—"}
            </div>
          </div>
          <div>
            <div className="text-cyber-muted text-xs mb-0.5">Bandwidth</div>
            <div className={isConnected ? "text-slate-200" : "text-cyber-muted line-through"}>
              {isConnected ? `${path.bandwidth_mbps} MB/s` : "—"}
            </div>
          </div>
          <div>
            <div className="text-cyber-muted text-xs mb-0.5">Queue Depth</div>
            <div className={isConnected ? "text-yellow-400" : "text-cyber-muted line-through"}>
              {isConnected ? path.queue_depth : "—"}
            </div>
          </div>
          <div>
            <div className="text-cyber-muted text-xs mb-0.5">LB Weight</div>
            <div className={isConnected ? "text-purple-400" : "text-cyber-muted line-through"}>
              {isConnected ? `${path.weight}%` : "—"}
            </div>
          </div>
          <div>
            <div className="text-cyber-muted text-xs mb-0.5">Read IOPS</div>
            <div className={isConnected ? "text-cyber-cyan" : "text-cyber-muted line-through"}>
              {isConnected ? path.iops_read.toLocaleString() : "—"}
            </div>
          </div>
          <div>
            <div className="text-cyber-muted text-xs mb-0.5">Write IOPS</div>
            <div className={isConnected ? "text-cyber-orange" : "text-cyber-muted line-through"}>
              {isConnected ? path.iops_write.toLocaleString() : "—"}
            </div>
          </div>
        </div>

        {isActive && isConnected && (
          <div className="mt-3 flex items-center gap-1.5 text-cyber-cyan text-xs font-mono">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span>IO Active</span>
          </div>
        )}
      </div>
    </div>
  )
}
