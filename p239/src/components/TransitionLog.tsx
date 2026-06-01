import { useTcpStore } from '@/store/useTcpStore'
import { EVENT_DISPLAY_NAMES } from '@/utils/tcpGraph'
import { History } from 'lucide-react'

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export default function TransitionLog() {
  const history = useTcpStore((s) => s.history)

  return (
    <div className="absolute bottom-6 right-6 w-96 max-h-80 z-10">
      <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-cyan-400" />
          <h2 className="text-white font-semibold text-sm">状态转移日志</h2>
          <span className="ml-auto text-white/40 text-xs font-mono">
            {history.length} 条记录
          </span>
        </div>

        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {history.length === 0 ? (
            <div className="text-white/30 text-sm text-center py-8">
              暂无转移记录
              <br />
              <span className="text-xs">点击左侧事件按钮开始</span>
            </div>
          ) : (
            [...history].reverse().map((record, idx) => {
              const isLatest = idx === 0
              return (
                <div
                  key={`${record.timestamp}-${idx}`}
                  className={`p-2.5 rounded-lg text-xs font-mono transition-all ${
                    isLatest
                      ? 'bg-cyan-500/10 border border-cyan-400/30'
                      : 'bg-white/5 border border-transparent hover:bg-white/8'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-white/40 shrink-0">
                      {formatTime(record.timestamp)}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        isLatest
                          ? 'bg-cyan-400/20 text-cyan-300'
                          : 'bg-white/10 text-white/60'
                      }`}
                    >
                      {EVENT_DISPLAY_NAMES[record.event as keyof typeof EVENT_DISPLAY_NAMES] ||
                        record.event}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={`${
                        ['LISTEN', 'SYN_RCVD', 'CLOSE_WAIT', 'LAST_ACK'].includes(record.from)
                          ? 'text-amber-400'
                          : record.from === 'ESTABLISHED'
                          ? 'text-green-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      {record.from}
                    </span>
                    <span className="text-white/30">→</span>
                    <span
                      className={`${
                        ['LISTEN', 'SYN_RCVD', 'CLOSE_WAIT', 'LAST_ACK'].includes(record.to)
                          ? 'text-amber-400'
                          : record.to === 'ESTABLISHED'
                          ? 'text-green-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      {record.to}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
