import { useSimulatorStore } from "@/store/simulatorStore"
import { RotateCcw, CheckCircle, XCircle, Clock, Layers } from "lucide-react"

export default function RetryQueue() {
  const status = useSimulatorStore((s) => s.status)

  if (!status) return null

  const rq = status.retry_queue
  const hasPending = rq.queue_size > 0

  return (
    <div className={`rounded-xl border p-5 transition-all duration-300 ${
      hasPending
        ? "border-cyber-orange/40 bg-cyber-surface shadow-[0_0_12px_rgba(255,107,53,0.15)]"
        : "border-cyber-border bg-cyber-surface"
    }`}>
      <div className="flex items-center gap-2 mb-4">
        <RotateCcw className={`w-5 h-5 ${hasPending ? "text-cyber-orange animate-spin" : "text-cyber-cyan"}`} style={hasPending ? { animationDuration: "3s" } : undefined} />
        <h2 className="font-mono font-semibold text-sm tracking-wide text-slate-200">
          RETRY QUEUE
        </h2>
        {hasPending && (
          <span className="ml-auto px-2 py-0.5 text-[10px] font-mono font-bold bg-cyber-orange/20 text-cyber-orange rounded-full border border-cyber-orange/30 animate-pulse">
            {rq.queue_size} PENDING
          </span>
        )}
      </div>

      <div className="text-center mb-4">
        <div className={`font-mono font-bold text-5xl tabular-nums tracking-tight ${
          hasPending ? "text-cyber-orange" : "text-cyber-cyan"
        }`}>
          {rq.queue_size}
        </div>
        <div className="text-cyber-muted text-xs font-mono mt-1">commands in queue</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="flex items-center gap-2 bg-cyber-bg/50 rounded-lg px-3 py-2">
          <Layers className="w-4 h-4 text-cyber-muted" />
          <div>
            <div className="text-[10px] font-mono text-cyber-muted">Queued</div>
            <div className="text-sm font-mono font-semibold text-slate-200">{rq.total_queued}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-cyber-bg/50 rounded-lg px-3 py-2">
          <RotateCcw className="w-4 h-4 text-blue-400" />
          <div>
            <div className="text-[10px] font-mono text-cyber-muted">Retried</div>
            <div className="text-sm font-mono font-semibold text-blue-400">{rq.total_retried}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-cyber-bg/50 rounded-lg px-3 py-2">
          <CheckCircle className="w-4 h-4 text-cyber-green" />
          <div>
            <div className="text-[10px] font-mono text-cyber-muted">Succeeded</div>
            <div className="text-sm font-mono font-semibold text-cyber-green">{rq.total_succeeded}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-cyber-bg/50 rounded-lg px-3 py-2">
          <XCircle className="w-4 h-4 text-cyber-red" />
          <div>
            <div className="text-[10px] font-mono text-cyber-muted">Expired</div>
            <div className="text-sm font-mono font-semibold text-cyber-red">{rq.total_expired}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs font-mono text-cyber-muted pt-3 border-t border-cyber-border">
        <Clock className="w-3.5 h-3.5" />
        <span>Retry interval: 5s | Max retries: 12</span>
      </div>
    </div>
  )
}
