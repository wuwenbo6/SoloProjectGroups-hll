import { useEffect, useRef } from 'react'
import { useZNSStore } from '@/store/zns-store'
import { Terminal, Trash2 } from 'lucide-react'
import type { ZoneState } from '@/types/zns'

const opColors: Record<string, string> = {
  open: '#00f0b5',
  close: '#f59e0b',
  finish: '#3b82f6',
  reset: '#ef4444',
  write: '#a78bfa',
}

const stateColors: Record<ZoneState, string> = {
  empty: '#6b7280',
  implicitly_opened: '#f59e0b',
  explicitly_opened: '#00f0b5',
  closed: '#3b82f6',
  full: '#ef4444',
}

export default function OperationLog() {
  const { logs, fetchLogs, initialized } = useZNSStore()
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  useEffect(() => {
    if (initialized) {
      const interval = setInterval(() => fetchLogs(), 2000)
      return () => clearInterval(interval)
    }
  }, [initialized, fetchLogs])

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      + '.' + String(d.getMilliseconds()).padStart(3, '0')
  }

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[#8b949e]" />
          <span className="text-[#8b949e] uppercase text-xs tracking-wider font-semibold"
            style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
            OPERATION LOG
          </span>
          <span className="text-[#484f58] text-xs font-mono">({logs.length})</span>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-2 font-mono text-xs space-y-0.5 min-h-0"
        style={{ maxHeight: '300px' }}>
        {logs.length === 0 ? (
          <p className="text-[#484f58] text-center py-4">No operations yet</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 py-1 px-2 rounded hover:bg-[#161b22] transition-colors">
              <span className="text-[#484f58] shrink-0">{formatTime(log.timestamp)}</span>
              <span className="shrink-0" style={{ color: opColors[log.operation] || '#8b949e' }}>
                [{log.operation.toUpperCase().padEnd(6)}]
              </span>
              <span className="text-[#6b7280] shrink-0">Zone {log.zoneId}</span>
              <span style={{ color: stateColors[log.fromState] }}>{log.fromState.replace(/_/g, ' ')}</span>
              <span className="text-[#484f58]">→</span>
              <span style={{ color: stateColors[log.toState] }}>{log.toState.replace(/_/g, ' ')}</span>
              <span className="text-[#484f58] truncate">{log.detail}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}
