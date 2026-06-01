import { useEffect, useRef } from 'react'
import { useSimulatorStore } from '@/store'
import { ScrollText } from 'lucide-react'

const levelColors: Record<string, string> = {
  info: 'text-cyan-400/80',
  warning: 'text-amber-400/80',
  warn: 'text-amber-400/80',
  error: 'text-red-400/80',
}

export default function EventLog() {
  const logs = useSimulatorStore((s) => s.logs)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto font-mono text-[11px] space-y-0.5 scroll-smooth"
    >
      {logs.length === 0 && (
        <div className="h-full flex items-center justify-center text-gray-600 text-sm">
          <ScrollText className="w-4 h-4 mr-2" />
          暂无日志
        </div>
      )}
      {logs.map((log, i) => {
        const time = new Date(log.timestamp * 1000).toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
        return (
          <div key={i} className="flex gap-2 px-1 py-0.5 hover:bg-white/[0.02] rounded">
            <span className="text-gray-600 flex-shrink-0">{time}</span>
            <span className={`flex-shrink-0 uppercase w-14 ${levelColors[log.level] || 'text-gray-500'}`}>
              [{log.level}]
            </span>
            <span className="text-gray-400">{log.event}</span>
            {log.detail && <span className="text-gray-600 ml-1">{log.detail}</span>}
          </div>
        )
      })}
    </div>
  )
}
