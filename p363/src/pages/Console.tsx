import ConfigPanel from '@/components/ConfigPanel'
import EventLog from '@/components/EventLog'
import { useWebSocket } from '@/hooks/useWebSocket'
import { Settings, ScrollText } from 'lucide-react'

function Panel({
  title,
  icon: Icon,
  children,
  className = '',
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-xl border border-[#1A1F2E] bg-[#0D1117]/80 backdrop-blur-sm overflow-hidden flex flex-col ${className}`}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1A1F2E] flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-cyan-400/70" />
        <span className="text-xs font-mono text-gray-400 tracking-wider">{title}</span>
      </div>
      <div className="flex-1 overflow-auto p-4">{children}</div>
    </div>
  )
}

export default function Console() {
  useWebSocket()

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center px-6 py-4 border-b border-[#1A1F2E]">
        <div>
          <h1 className="text-lg font-mono font-bold text-gray-200 tracking-wide">控制台</h1>
          <p className="text-[11px] text-gray-600 font-mono mt-0.5">
            模拟参数配置 · 事件日志监控
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-4 h-full">
          <Panel title="参数配置" icon={Settings}>
            <ConfigPanel />
          </Panel>
          <Panel title="事件日志" icon={ScrollText} className="min-h-[500px]">
            <EventLog />
          </Panel>
        </div>
      </div>
    </div>
  )
}
