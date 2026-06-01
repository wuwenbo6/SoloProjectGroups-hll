import { useSimulatorStore } from "@/store/simulatorStore"
import { ArrowRightLeft, Clock } from "lucide-react"

export default function SwitchCounter() {
  const status = useSimulatorStore((s) => s.status)

  if (!status) return null

  return (
    <div className="rounded-xl border border-cyber-border bg-cyber-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <ArrowRightLeft className="w-5 h-5 text-cyber-orange" />
        <h2 className="font-mono font-semibold text-sm tracking-wide text-slate-200">
          FAILOVER COUNTER
        </h2>
      </div>

      <div className="text-center">
        <div className="font-mono font-bold text-5xl text-cyber-cyan tabular-nums tracking-tight">
          {status.switch_count}
        </div>
        <div className="text-cyber-muted text-xs font-mono mt-1">path switches</div>
      </div>

      {status.last_switch_direction && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <span className="text-cyber-orange font-mono font-semibold">
            {status.last_switch_direction}
          </span>
        </div>
      )}

      {status.last_switch_time && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-cyber-muted font-mono">
          <Clock className="w-3 h-3" />
          <span>{new Date(status.last_switch_time).toLocaleTimeString()}</span>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-cyber-border">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-cyber-muted">Current Active</span>
          <span className="text-cyber-cyan font-semibold uppercase">
            {status.active_path === "pathA" ? "Path A" : "Path B"}
          </span>
        </div>
      </div>
    </div>
  )
}
