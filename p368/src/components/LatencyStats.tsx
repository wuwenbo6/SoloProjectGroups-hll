import { useSimulatorStore } from "@/store/simulatorStore"
import { Timer, TrendingUp, TrendingDown, Minus } from "lucide-react"

export default function LatencyStats() {
  const status = useSimulatorStore((s) => s.status)

  if (!status) return null

  const ls = status.latency_stats

  return (
    <div className="rounded-xl border border-cyber-border bg-cyber-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <Timer className="w-5 h-5 text-cyber-orange" />
        <h2 className="font-mono font-semibold text-sm tracking-wide text-slate-200">
          SWITCH LATENCY
        </h2>
        <span className="ml-auto text-[10px] font-mono text-cyber-muted">
          {ls.count} samples
        </span>
      </div>

      {ls.count === 0 ? (
        <div className="text-center py-6">
          <div className="text-cyber-muted text-xs font-mono">
            No switch data yet
          </div>
          <div className="text-cyber-muted/60 text-[10px] font-mono mt-1">
            Trigger a path disconnect to collect latency
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-cyber-bg/50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1 text-[10px] font-mono text-cyber-muted">
                <TrendingDown className="w-3 h-3" />Min
              </div>
              <div className="text-sm font-mono font-semibold text-cyber-green">{ls.min_ms} ms</div>
            </div>
            <div className="bg-cyber-bg/50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1 text-[10px] font-mono text-cyber-muted">
                <TrendingUp className="w-3 h-3" />Max
              </div>
              <div className="text-sm font-mono font-semibold text-cyber-red">{ls.max_ms} ms</div>
            </div>
            <div className="bg-cyber-bg/50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1 text-[10px] font-mono text-cyber-muted">
                <Minus className="w-3 h-3" />Avg
              </div>
              <div className="text-sm font-mono font-semibold text-cyber-cyan">{ls.avg_ms.toFixed(1)} ms</div>
            </div>
            <div className="bg-cyber-bg/50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1 text-[10px] font-mono text-cyber-muted">
                P50
              </div>
              <div className="text-sm font-mono font-semibold text-slate-200">{ls.p50_ms} ms</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-cyber-bg/50 rounded-lg px-3 py-2">
              <div className="text-[10px] font-mono text-cyber-muted">P95</div>
              <div className="text-sm font-mono font-semibold text-cyber-orange">{ls.p95_ms} ms</div>
            </div>
            <div className="bg-cyber-bg/50 rounded-lg px-3 py-2">
              <div className="text-[10px] font-mono text-cyber-muted">P99</div>
              <div className="text-sm font-mono font-semibold text-cyber-red">{ls.p99_ms} ms</div>
            </div>
          </div>

          {ls.recent_records && ls.recent_records.length > 0 && (
            <div className="pt-3 border-t border-cyber-border">
              <div className="text-[10px] font-mono text-cyber-muted uppercase tracking-wider mb-2">
                Recent Switches
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {[...ls.recent_records].reverse().map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                    <span className={`px-1 py-0.5 rounded ${
                      r.reason === "failover"
                        ? "bg-cyber-orange/20 text-cyber-orange"
                        : r.reason === "priority_fallback"
                        ? "bg-purple-400/20 text-purple-400"
                        : "bg-cyber-cyan/20 text-cyber-cyan"
                    }`}>
                      {r.reason.replace(/_/g, " ")}
                    </span>
                    <span className="text-cyber-muted">
                      {r.from_path === "pathA" ? "A" : "B"}→{r.to_path === "pathA" ? "A" : "B"}
                    </span>
                    <span className={`font-semibold ${
                      r.latency_ms < 5 ? "text-cyber-green" : r.latency_ms < 20 ? "text-cyber-orange" : "text-cyber-red"
                    }`}>
                      {r.latency_ms}ms
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
