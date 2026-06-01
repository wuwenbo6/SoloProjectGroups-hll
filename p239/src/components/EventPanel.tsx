import { useTcpStore } from '@/store/useTcpStore'
import { EVENT_DISPLAY_NAMES, type TcpEvent } from '@/utils/tcpGraph'
import { Play, RotateCcw, Zap, ArrowRight } from 'lucide-react'

const ALL_EVENTS: TcpEvent[] = [
  'ACTIVE_OPEN',
  'PASSIVE_OPEN',
  'SEND',
  'RCV',
  'CLOSE',
  'SYN_RCVD',
  'SYN_ACK_RCVD',
  'ACK_RCVD',
  'FIN_RCVD',
  'FIN_ACK_RCVD',
  'TIMEOUT',
]

const EVENT_GROUPS: { title: string; events: TcpEvent[] }[] = [
  {
    title: '连接管理',
    events: ['ACTIVE_OPEN', 'PASSIVE_OPEN', 'CLOSE'] as TcpEvent[],
  },
  {
    title: '数据传输',
    events: ['SEND', 'RCV'] as TcpEvent[],
  },
  {
    title: '接收事件',
    events: ['SYN_RCVD', 'SYN_ACK_RCVD', 'ACK_RCVD', 'FIN_RCVD', 'FIN_ACK_RCVD'] as TcpEvent[],
  },
  {
    title: '超时',
    events: ['TIMEOUT'] as TcpEvent[],
  },
]

const getStateColor = (state: string) => {
  if (state === 'ESTABLISHED') return 'text-green-400'
  if (['LISTEN', 'SYN_RCVD', 'CLOSE_WAIT', 'LAST_ACK'].includes(state)) return 'text-amber-400'
  return 'text-cyan-400'
}

export default function EventPanel() {
  const currentState = useTcpStore((s) => s.currentState)
  const availableEvents = useTcpStore((s) => s.availableEvents)
  const transitioning = useTcpStore((s) => s.transitioning)
  const triggerEvent = useTcpStore((s) => s.triggerEvent)
  const resetMachine = useTcpStore((s) => s.resetMachine)

  const handleEventClick = (event: TcpEvent) => {
    if (transitioning) return
    if (!availableEvents.includes(event)) return
    triggerEvent(event)
  }

  return (
    <div className="absolute top-6 left-6 w-72 max-h-[calc(100vh-48px)] overflow-y-auto z-10">
      <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">TCP 状态机</h1>
            <p className="text-white/40 text-xs">LwIP 协议栈仿真</p>
          </div>
        </div>

        <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
          <p className="text-white/50 text-xs mb-2 uppercase tracking-wider">当前状态</p>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                currentState === 'ESTABLISHED'
                  ? 'bg-green-400'
                  : ['LISTEN', 'SYN_RCVD', 'CLOSE_WAIT', 'LAST_ACK'].includes(currentState)
                  ? 'bg-amber-400'
                  : 'bg-cyan-400'
              } animate-pulse`}
            />
            <span
              className={`font-mono text-xl font-bold ${getStateColor(currentState)}`}
            >
              {currentState}
            </span>
          </div>
        </div>

        {EVENT_GROUPS.map((group) => (
          <div key={group.title} className="mb-4 last:mb-0">
            <p className="text-white/40 text-xs mb-2 uppercase tracking-wider">
              {group.title}
            </p>
            <div className="flex flex-col gap-2">
              {group.events.map((event) => {
                const isAvailable = availableEvents.includes(event)
                const isDisabled = !isAvailable || transitioning

                return (
                  <button
                    key={event}
                    onClick={() => handleEventClick(event)}
                    disabled={isDisabled}
                    className={`group relative px-4 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center justify-between ${
                      isAvailable && !transitioning
                        ? 'bg-gradient-to-r from-cyan-500/20 to-cyan-400/10 border border-cyan-400/40 text-cyan-300 hover:from-cyan-500/30 hover:to-cyan-400/20 hover:border-cyan-400/60 hover:shadow-lg hover:shadow-cyan-500/20 active:scale-98'
                        : 'bg-white/5 border border-white/10 text-white/25 cursor-not-allowed'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {isAvailable && !transitioning ? (
                        <Play className="w-3.5 h-3.5" />
                      ) : (
                        <div className="w-3.5 h-3.5" />
                      )}
                      <span>{EVENT_DISPLAY_NAMES[event]}</span>
                    </span>
                    <span className="font-mono text-xs opacity-60">{event}</span>
                    {isAvailable && !transitioning && (
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-400/0 via-cyan-400/5 to-cyan-400/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="mt-6 pt-4 border-t border-white/10">
          <button
            onClick={resetMachine}
            disabled={transitioning}
            className="w-full px-4 py-3 rounded-xl font-medium text-sm bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            重置状态机
          </button>
        </div>
      </div>
    </div>
  )
}
