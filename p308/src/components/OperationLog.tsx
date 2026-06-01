import React, { useEffect, useRef } from 'react'
import { useCard } from '../hooks/useCard'
import { Terminal } from 'lucide-react'

export function OperationLog() {
  const { logs, clearLogs } = useCard()
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const directionColor = (dir: string) => {
    switch (dir) {
      case 'send': return 'text-cyan-400'
      case 'recv': return 'text-green-400'
      case 'info': return 'text-yellow-400'
      case 'error': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const directionPrefix = (dir: string) => {
    switch (dir) {
      case 'send': return '>>'
      case 'recv': return '<<'
      case 'info': return '=='
      case 'error': return '!!'
      default: return '--'
    }
  }

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-cyber-border bg-cyber-surface">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-cyber-accent" />
          <span className="text-xs font-mono text-cyber-accent uppercase tracking-wider">Operation Log</span>
        </div>
        <button
          onClick={clearLogs}
          className="text-xs text-cyber-muted hover:text-cyber-danger transition-colors font-mono"
        >
          CLEAR
        </button>
      </div>
      <div className="h-48 overflow-y-auto p-3 font-mono text-xs space-y-0.5 scrollbar-thin scrollbar-thumb-cyber-border scrollbar-track-transparent">
        {logs.length === 0 && (
          <div className="text-cyber-muted italic">No operations yet...</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2">
            <span className="text-cyber-muted shrink-0">
              {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })}
            </span>
            <span className={`shrink-0 ${directionColor(log.direction)}`}>
              {directionPrefix(log.direction)}
            </span>
            <span className={`${directionColor(log.direction)} break-all`}>
              {log.message}
              {log.data && (
                <span className="text-gray-400 ml-2">[{log.data}]</span>
              )}
            </span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  )
}
