import { useTcpStore } from '@/store/useTcpStore'
import { STATE_DESCRIPTIONS, NODE_COLORS, type TcpState } from '@/utils/tcpGraph'
import { Info } from 'lucide-react'

export default function NodeTooltip() {
  const hoveredNode = useTcpStore((s) => s.hoveredNode)
  const currentState = useTcpStore((s) => s.currentState)

  if (!hoveredNode) return null

  const nodeType =
    hoveredNode === 'ESTABLISHED'
      ? 'shared'
      : ['LISTEN', 'SYN_RCVD', 'CLOSE_WAIT', 'LAST_ACK'].includes(hoveredNode)
      ? 'server'
      : 'client'

  const colors = NODE_COLORS[nodeType]
  const description =
    STATE_DESCRIPTIONS[hoveredNode as keyof typeof STATE_DESCRIPTIONS] || ''
  const isCurrent = hoveredNode === currentState

  return (
    <div
      className="fixed z-50 pointer-events-none transform -translate-x-1/2"
      style={{
        left: `${window.innerWidth / 2}px`,
        top: '80px',
      }}
    >
      <div
        className="bg-black/80 backdrop-blur-xl border rounded-xl p-4 shadow-2xl min-w-72"
        style={{ borderColor: colors.border + '50' }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: colors.border + '20' }}
          >
            <Info className="w-4 h-4" style={{ color: colors.border }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-lg" style={{ color: colors.border }}>
                {hoveredNode}
              </span>
              {isCurrent && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 font-medium">
                  当前
                </span>
              )}
            </div>
            <div className="text-white/40 text-[11px] uppercase tracking-wider">
              {nodeType === 'client'
                ? '客户端状态'
                : nodeType === 'server'
                ? '服务端状态'
                : '共享状态'}
            </div>
          </div>
        </div>
        <p className="text-white/70 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
