import { useEffect, useRef } from "react"
import { useSimulatorStore } from "@/store/simulatorStore"
import { ScrollText, Link, Unlink, ArrowRightLeft, RefreshCw, Play, RotateCcw, CheckCircle, XCircle, Timer, ArrowLeftRight } from "lucide-react"
import type { SimEvent } from "@/types"

const eventConfig: Record<string, { color: string; icon: React.ReactNode; badgeBg: string; badgeText: string }> = {
  connect: { color: "text-cyber-green", icon: <Link className="w-3.5 h-3.5" />, badgeBg: "bg-cyber-green/20", badgeText: "text-cyber-green" },
  disconnect: { color: "text-cyber-red", icon: <Unlink className="w-3.5 h-3.5" />, badgeBg: "bg-cyber-red/20", badgeText: "text-cyber-red" },
  switch: { color: "text-cyber-orange", icon: <ArrowRightLeft className="w-3.5 h-3.5" />, badgeBg: "bg-cyber-orange/20", badgeText: "text-cyber-orange" },
  recover: { color: "text-cyber-green", icon: <RefreshCw className="w-3.5 h-3.5" />, badgeBg: "bg-cyber-green/20", badgeText: "text-cyber-green" },
  io_resume: { color: "text-cyber-cyan", icon: <Play className="w-3.5 h-3.5" />, badgeBg: "bg-cyber-cyan/20", badgeText: "text-cyber-cyan" },
  retry_queue: { color: "text-cyber-orange", icon: <Timer className="w-3.5 h-3.5" />, badgeBg: "bg-cyber-orange/20", badgeText: "text-cyber-orange" },
  retry_success: { color: "text-cyber-green", icon: <CheckCircle className="w-3.5 h-3.5" />, badgeBg: "bg-cyber-green/20", badgeText: "text-cyber-green" },
  retry_expired: { color: "text-cyber-red", icon: <XCircle className="w-3.5 h-3.5" />, badgeBg: "bg-cyber-red/20", badgeText: "text-cyber-red" },
  retry_pending: { color: "text-yellow-400", icon: <RotateCcw className="w-3.5 h-3.5" />, badgeBg: "bg-yellow-400/20", badgeText: "text-yellow-400" },
  fallback: { color: "text-purple-400", icon: <ArrowLeftRight className="w-3.5 h-3.5" />, badgeBg: "bg-purple-400/20", badgeText: "text-purple-400" },
  switch_latency: { color: "text-cyber-orange", icon: <Timer className="w-3.5 h-3.5" />, badgeBg: "bg-cyber-orange/20", badgeText: "text-cyber-orange" },
}

function EventItem({ event }: { event: SimEvent }) {
  const config = eventConfig[event.type] || { color: "text-cyber-muted", icon: null, badgeBg: "bg-cyber-muted/20", badgeText: "text-cyber-muted" }

  return (
    <div className="flex items-start gap-3 py-2 animate-slide_in">
      <div className="flex-shrink-0 mt-0.5">
        <div className={`${config.color}`}>{config.icon}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${config.badgeBg} ${config.badgeText}`}
          >
            {event.type}
          </span>
          <span className="text-cyber-muted text-[10px] font-mono">
            {event.path === "pathA" ? "PathA" : "PathB"}
          </span>
        </div>
        <div className="text-xs text-slate-300 font-mono leading-relaxed">
          {event.message}
        </div>
      </div>
      <div className="flex-shrink-0 text-[10px] text-cyber-muted font-mono mt-0.5">
        {new Date(event.timestamp).toLocaleTimeString()}
      </div>
    </div>
  )
}

export default function EventLog() {
  const events = useSimulatorStore((s) => s.events)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  return (
    <div className="rounded-xl border border-cyber-border bg-cyber-surface p-5">
      <div className="flex items-center gap-2 mb-3">
        <ScrollText className="w-5 h-5 text-cyber-cyan" />
        <h2 className="font-mono font-semibold text-sm tracking-wide text-slate-200">
          EVENT LOG
        </h2>
      </div>

      <div
        ref={scrollRef}
        className="h-72 overflow-y-auto space-y-0.5 pr-1"
      >
        {events.length === 0 ? (
          <div className="text-cyber-muted text-xs font-mono text-center py-8">
            No events yet
          </div>
        ) : (
          [...events].reverse().map((event, i) => (
            <EventItem key={`${event.timestamp}-${i}`} event={event} />
          ))
        )}
      </div>
    </div>
  )
}
