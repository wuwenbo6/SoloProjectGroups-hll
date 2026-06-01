import { useDDSStore } from '@/store/ddsStore'
import { CheckCircle, XCircle, Filter } from 'lucide-react'

export default function MessageTimeline() {
  const { messages } = useDDSStore()

  const originalMessages = messages.slice(0, 50)
  const filteredMessages = messages.filter((m) => m.delivered).slice(0, 50)

  function formatTime(ts: number): string {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  }

  function getTopicColor(topic: string): string {
    if (topic.includes('temp')) return 'text-orange-400'
    if (topic.includes('pressure')) return 'text-cyan-400'
    if (topic.includes('humidity')) return 'text-blue-400'
    if (topic.includes('velocity')) return 'text-green-400'
    if (topic.includes('control')) return 'text-pink-400'
    return 'text-slate-400'
  }

  return (
    <div className="bg-[#111827] border border-[#1E293B] rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white tracking-wide mb-4">消息时间线</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm font-medium text-slate-300">原始消息流</span>
            <span className="text-xs text-slate-500 font-mono ml-auto">({messages.length})</span>
          </div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
            {originalMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 px-3 py-2 rounded-lg text-xs font-mono transition-all duration-300 ${
                  msg.filteredByContent
                    ? 'bg-purple-950/30 border border-purple-900/30'
                    : msg.filteredByTime
                      ? 'bg-red-950/30 border border-red-900/30'
                      : 'bg-[#0F172A] border border-[#1E293B]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-8 shrink-0">#{msg.id}</span>
                  <span className={`text-[10px] font-semibold ${getTopicColor(msg.topic)} shrink-0`}>
                    {msg.topic.split('/')[1]}
                  </span>
                  <span className="text-slate-400 flex-1">{msg.data}</span>
                  <span className="text-amber-300 font-semibold shrink-0">{msg.value.toFixed(1)}</span>
                  {msg.filteredByContent ? (
                    <Filter className="w-3 h-3 text-purple-500 shrink-0" />
                  ) : msg.filteredByTime ? (
                    <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                  ) : (
                    <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-600">{formatTime(msg.source_timestamp)}</span>
                  {msg.filteredByContent && <span className="text-purple-500">内容过滤拦截</span>}
                  {msg.filteredByTime && <span className="text-red-500">时间过滤拦截</span>}
                  {msg.delivered && <span className="text-emerald-500">通过</span>}
                </div>
              </div>
            ))}
            {originalMessages.length === 0 && (
              <div className="text-center text-slate-600 text-sm py-8">等待消息...</div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-slate-300">过滤后消息流</span>
            <span className="text-xs text-slate-500 font-mono ml-auto">({filteredMessages.length})</span>
          </div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
            {filteredMessages.map((msg) => (
              <div
                key={msg.id}
                className="flex flex-col gap-1 px-3 py-2 rounded-lg text-xs font-mono bg-emerald-950/20 border border-emerald-900/30 animate-[fadeIn_0.3s_ease-in]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 w-8 shrink-0">#{msg.id}</span>
                  <span className={`text-[10px] font-semibold ${getTopicColor(msg.topic)} shrink-0`}>
                    {msg.topic.split('/')[1]}
                  </span>
                  <span className="text-emerald-300 flex-1">{msg.data}</span>
                  <span className="text-amber-300 font-semibold shrink-0">{msg.value.toFixed(1)}</span>
                  <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                </div>
                <div className="text-[10px] text-slate-600">
                  {formatTime(msg.source_timestamp)}
                </div>
              </div>
            ))}
            {filteredMessages.length === 0 && (
              <div className="text-center text-slate-600 text-sm py-8">等待消息...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
