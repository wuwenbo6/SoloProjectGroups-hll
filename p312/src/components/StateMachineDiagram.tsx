import { useZNSStore } from '@/store/zns-store'
import type { ZoneState } from '@/types/zns'

const stateColors: Record<ZoneState, string> = {
  empty: '#6b7280',
  implicitly_opened: '#f59e0b',
  explicitly_opened: '#00f0b5',
  closed: '#3b82f6',
  full: '#ef4444',
}

const stateLabels: Record<ZoneState, string> = {
  empty: 'EMPTY',
  implicitly_opened: 'IMPL\nOPEN',
  explicitly_opened: 'EXPL\nOPEN',
  closed: 'CLOSED',
  full: 'FULL',
}

interface Transition {
  from: ZoneState
  to: ZoneState
  label: string
}

const transitions: Transition[] = [
  { from: 'empty', to: 'explicitly_opened', label: 'Open' },
  { from: 'empty', to: 'implicitly_opened', label: 'Write' },
  { from: 'implicitly_opened', to: 'implicitly_opened', label: 'Write' },
  { from: 'explicitly_opened', to: 'explicitly_opened', label: 'Write' },
  { from: 'implicitly_opened', to: 'closed', label: 'Close' },
  { from: 'explicitly_opened', to: 'closed', label: 'Close' },
  { from: 'implicitly_opened', to: 'full', label: 'Finish' },
  { from: 'explicitly_opened', to: 'full', label: 'Finish' },
  { from: 'closed', to: 'explicitly_opened', label: 'Open' },
  { from: 'closed', to: 'full', label: 'Finish' },
  { from: 'full', to: 'empty', label: 'Reset' },
]

export default function StateMachineDiagram() {
  const { selectedZoneId, zones } = useZNSStore()
  const selectedZone = zones.find((z) => z.id === selectedZoneId)

  const states: ZoneState[] = ['empty', 'implicitly_opened', 'explicitly_opened', 'closed', 'full']
  const positions: Record<string, { x: number; y: number }> = {
    empty: { x: 140, y: 40 },
    implicitly_opened: { x: 40, y: 140 },
    explicitly_opened: { x: 240, y: 140 },
    closed: { x: 140, y: 240 },
    full: { x: 140, y: 340 },
  }

  const isActiveTransition = (t: Transition) => {
    if (!selectedZone) return false
    return t.from === selectedZone.state
  }

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
      <div className="text-[#8b949e] uppercase text-xs tracking-wider font-semibold mb-3"
        style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
        STATE MACHINE
      </div>

      <svg viewBox="0 0 280 390" className="w-full">
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#484f58" />
          </marker>
          <marker id="arrowhead-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#00f0b5" />
          </marker>
          {states.map((state) => (
            <filter key={`glow-${state}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feFlood floodColor={stateColors[state]} floodOpacity="0.6" />
              <feComposite in2="blur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {transitions.map((t, i) => {
          const from = positions[t.from]
          const to = positions[t.to]
          const active = isActiveTransition(t)
          const isSelfLoop = t.from === t.to

          if (isSelfLoop) {
            const cx = from.x
            const cy = from.y - 24
            return (
              <g key={i}>
                <path
                  d={`M ${cx - 12} ${cy} C ${cx - 30} ${cy - 35}, ${cx + 30} ${cy - 35}, ${cx + 12} ${cy}`}
                  fill="none"
                  stroke={active ? '#00f0b5' : '#484f58'}
                  strokeWidth={active ? 1.5 : 1}
                  markerEnd={active ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                  opacity={active ? 1 : 0.5}
                />
                <text
                  x={cx}
                  y={cy - 28}
                  textAnchor="middle"
                  fill={active ? '#00f0b5' : '#6b7280'}
                  fontSize="8"
                  fontFamily="Space Grotesk, sans-serif"
                >
                  {t.label}
                </text>
              </g>
            )
          }

          const dx = to.x - from.x
          const dy = to.y - from.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const nx = dx / dist
          const ny = dy / dist
          const startX = from.x + nx * 26
          const startY = from.y + ny * 26
          const endX = to.x - nx * 26
          const endY = to.y - ny * 26

          const midX = (startX + endX) / 2
          const midY = (startY + endY) / 2
          const offsetX = -ny * 12
          const offsetY = nx * 12
          const ctrlX = midX + offsetX
          const ctrlY = midY + offsetY

          return (
            <g key={i}>
              <path
                d={`M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`}
                fill="none"
                stroke={active ? '#00f0b5' : '#484f58'}
                strokeWidth={active ? 1.5 : 1}
                markerEnd={active ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                opacity={active ? 1 : 0.5}
              />
              <text
                x={ctrlX}
                y={ctrlY - 4}
                textAnchor="middle"
                fill={active ? '#00f0b5' : '#6b7280'}
                fontSize="7"
                fontFamily="Space Grotesk, sans-serif"
              >
                {t.label}
              </text>
            </g>
          )
        })}

        {states.map((state) => {
          const pos = positions[state]
          const isActive = selectedZone?.state === state
          const color = stateColors[state]

          return (
            <g key={state}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={isActive ? 22 : 20}
                fill={isActive ? `${color}22` : '#161b22'}
                stroke={color}
                strokeWidth={isActive ? 2 : 1.5}
                filter={isActive ? `url(#glow-${state})` : undefined}
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
                fontSize="8"
                fontWeight="600"
                fontFamily="Space Grotesk, sans-serif"
              >
                {stateLabels[state]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
