import { useTcpStore } from '@/store/useTcpStore'
import { CONGESTION_EVENT_NAMES, type CongestionEvent } from '@/types/congestion'
import { Send, Check, RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react'

const CONGESTION_BUTTONS: {
  event: CongestionEvent
  icon: typeof Send
  color: string
  hoverColor: string
  glowColor: string
}[] = [
  {
    event: 'SEND_PACKET',
    icon: Send,
    color: '#4ade80',
    hoverColor: '#22c55e',
    glowColor: 'rgba(74, 222, 128, 0.3)',
  },
  {
    event: 'ACK_RECEIVED',
    icon: Check,
    color: '#00e5ff',
    hoverColor: '#00c4d9',
    glowColor: 'rgba(0, 229, 255, 0.3)',
  },
  {
    event: 'DUP_ACK',
    icon: RefreshCw,
    color: '#ffab00',
    hoverColor: '#f59e0b',
    glowColor: 'rgba(255, 171, 0, 0.3)',
  },
  {
    event: 'TIMEOUT_RETRANSMIT',
    icon: AlertTriangle,
    color: '#ef4444',
    hoverColor: '#dc2626',
    glowColor: 'rgba(239, 68, 68, 0.3)',
  },
]

const EVENT_GROUPS: { title: string; events: CongestionEvent[] }[] = [
  {
    title: '正常传输',
    events: ['SEND_PACKET', 'ACK_RECEIVED'] as CongestionEvent[],
  },
  {
    title: '拥塞事件',
    events: ['DUP_ACK', 'TIMEOUT_RETRANSMIT'] as CongestionEvent[],
  },
]

export default function CongestionControls() {
  const currentState = useTcpStore((s) => s.currentState)
  const sendingPacket = useTcpStore((s) => s.sendingPacket)
  const triggerCongestionEvent = useTcpStore((s) => s.triggerCongestionEvent)
  const resetCongestion = useTcpStore((s) => s.resetCongestion)

  const isEstablished = currentState === 'ESTABLISHED'
  const isDisabled = !isEstablished || sendingPacket

  const handleEventClick = (event: CongestionEvent) => {
    if (isDisabled) return
    triggerCongestionEvent(event)
  }

  const getButtonConfig = (event: CongestionEvent) => {
    return CONGESTION_BUTTONS.find((b) => b.event === event)!
  }

  return (
    <div className="absolute top-[276px] right-6 w-[380px] z-10">
      <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Send className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">拥塞控制事件</h2>
              <p className="text-white/40 text-xs">
                {isEstablished ? '点击触发事件' : '请先建立连接'}
              </p>
            </div>
          </div>
          {!isEstablished && (
            <span className="px-2 py-1 rounded text-[10px] bg-white/5 text-white/40 font-medium">
              需要 ESTABLISHED
            </span>
          )}
        </div>

        {EVENT_GROUPS.map((group) => (
          <div key={group.title} className="mb-3 last:mb-0">
            <p className="text-white/40 text-xs mb-2 uppercase tracking-wider">
              {group.title}
            </p>
            <div className="flex flex-col gap-2">
              {group.events.map((event) => {
                const config = getButtonConfig(event)
                const Icon = config.icon
                const isRetransmit = event === 'TIMEOUT_RETRANSMIT'

                return (
                  <button
                    key={event}
                    onClick={() => handleEventClick(event)}
                    disabled={isDisabled}
                    className={`group relative px-4 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center justify-between ${
                      isEstablished && !sendingPacket
                        ? 'hover:shadow-lg active:scale-98'
                        : 'cursor-not-allowed opacity-50'
                    } ${isRetransmit && isEstablished && !sendingPacket ? 'animate-pulse-glow' : ''}`}
                    style={{
                      backgroundColor: isEstablished && !sendingPacket
                        ? `${config.color}15`
                        : 'rgba(255,255,255,0.03)',
                      borderColor: isEstablished && !sendingPacket
                        ? `${config.color}40`
                        : 'rgba(255,255,255,0.08)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      color: isEstablished && !sendingPacket ? config.color : 'rgba(255,255,255,0.25)',
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Icon
                        className="w-4 h-4"
                        style={{
                          color: isEstablished && !sendingPacket ? config.color : 'rgba(255,255,255,0.25)',
                        }}
                      />
                      <span>{CONGESTION_EVENT_NAMES[event]}</span>
                    </span>
                    <span className="font-mono text-xs opacity-60">{event}</span>
                    {isEstablished && !sendingPacket && (
                      <div
                        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{
                          background: `linear-gradient(to right, ${config.color}00, ${config.color}08, ${config.color}00)`,
                        }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="mt-4 pt-4 border-t border-white/10">
          <button
            onClick={resetCongestion}
            disabled={sendingPacket}
            className="w-full px-4 py-2.5 rounded-xl font-medium text-sm bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            重置拥塞控制
          </button>
        </div>
      </div>
    </div>
  )
}
