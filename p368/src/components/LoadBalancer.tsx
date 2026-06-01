import { useSimulatorStore } from "@/store/simulatorStore"
import { Scale } from "lucide-react"

export default function LoadBalancer() {
  const status = useSimulatorStore((s) => s.status)

  if (!status) return null

  const lb = status.load_balancer
  const wA = lb.path_a_weight
  const wB = lb.path_b_weight

  return (
    <div className="rounded-xl border border-cyber-border bg-cyber-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <Scale className="w-5 h-5 text-purple-400" />
        <h2 className="font-mono font-semibold text-sm tracking-wide text-slate-200">
          LOAD BALANCER
        </h2>
        <span className="ml-auto text-[10px] font-mono text-cyber-muted uppercase tracking-wider">
          {lb.mode.replace(/_/g, " ")}
        </span>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-mono text-cyber-cyan">Path A</span>
          <span className="text-xs font-mono text-cyber-muted">{lb.path_a_ratio}</span>
        </div>
        <div className="w-full h-3 bg-cyber-bg rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyber-cyan/80 to-cyber-cyan rounded-full transition-all duration-500"
            style={{ width: `${wA}%` }}
          />
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-mono text-blue-400">Path B</span>
          <span className="text-xs font-mono text-cyber-muted">{lb.path_b_ratio}</span>
        </div>
        <div className="w-full h-3 bg-cyber-bg rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500/80 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${wB}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-cyber-border">
        <div className="bg-cyber-bg/50 rounded-lg px-3 py-2">
          <div className="text-[10px] font-mono text-cyber-muted">PathA Depth</div>
          <div className="text-sm font-mono font-semibold text-yellow-400">{lb.path_a_depth}</div>
        </div>
        <div className="bg-cyber-bg/50 rounded-lg px-3 py-2">
          <div className="text-[10px] font-mono text-cyber-muted">PathB Depth</div>
          <div className="text-sm font-mono font-semibold text-yellow-400">{lb.path_b_depth}</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-cyber-border text-[10px] font-mono text-cyber-muted">
        Weight = 1 / (depth + 1). Shallower queue gets more IO.
      </div>
    </div>
  )
}
