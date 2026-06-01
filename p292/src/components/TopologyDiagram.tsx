import { useLMAStore } from '@/store'

interface TopologyNode {
  id: string
  type: 'lma' | 'mag' | 'mn'
  label: string
  sublabel: string
  x: number
  y: number
  tech?: string
}

interface TunnelLink {
  mn_id: string
  old_mag: string
  new_mag: string
  status: string
  buffered: number
}

export default function TopologyDiagram() {
  const { entries, tunnels } = useLMAStore()
  const safeEntries = entries || []
  const safeTunnels = tunnels || []

  const magSet = new Map<string, { mns: string[]; tech: string }>()
  safeEntries.forEach((e) => {
    const existing = magSet.get(e.mag_address)
    if (existing) {
      if (!existing.mns.includes(e.mn_id)) existing.mns.push(e.mn_id)
      existing.tech = e.access_tech_type
    } else {
      magSet.set(e.mag_address, { mns: [e.mn_id], tech: e.access_tech_type })
    }
  })

  const nodes: TopologyNode[] = [
    { id: 'lma', type: 'lma', label: 'LMA', sublabel: '', x: 300, y: 60 },
  ]

  const magList = Array.from(magSet.keys())
  const magSpacing = 600 / Math.max(magList.length + 1, 1)

  magList.forEach((mag, i) => {
    const x = magSpacing * (i + 1)
    const info = magSet.get(mag)!
    nodes.push({ id: mag, type: 'mag', label: 'MAG', sublabel: mag, x, y: 170, tech: info.tech })
    const mns = info.mns
    const mnSpacing = magSpacing / (mns.length + 1)
    mns.forEach((mnId, j) => {
      nodes.push({
        id: mnId,
        type: 'mn',
        label: mnId,
        sublabel: '',
        x: x - magSpacing / 2 + mnSpacing * (j + 1),
        y: 280,
      })
    })
  })

  const lma = nodes.find((n) => n.type === 'lma')!
  const mags = nodes.filter((n) => n.type === 'mag')
  const mns = nodes.filter((n) => n.type === 'mn')

  const tunnelLinks: TunnelLink[] = safeTunnels.map((t) => ({
    mn_id: t.mn_id,
    old_mag: t.old_mag,
    new_mag: t.new_mag,
    status: t.status,
    buffered: t.buffered_packets,
  }))

  const techStrokeColor = (tech?: string): string => {
    switch (tech) {
      case '5g': return '#8b5cf6'
      case 'lte': return '#3b82f6'
      case 'wifi': return '#00ffc8'
      case 'ethernet': return '#64748b'
      default: return '#2a3a5c'
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-lg text-lma-text">Network Topology</h2>
        {tunnelLinks.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-lma-yellow animate-pulse" />
            <span className="text-[11px] font-mono text-lma-yellow">
              {tunnelLinks.length} bidirectional tunnel{tunnelLinks.length > 1 ? 's' : ''} active
            </span>
          </div>
        )}
      </div>
      <svg viewBox="0 0 600 330" className="w-full" style={{ maxHeight: '310px' }}>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker id="arrowYellow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
          </marker>
        </defs>

        {mags.map((mag) => {
          const stroke = techStrokeColor(mag.tech)
          const strokeWidth = mag.tech === '5g' ? 2.5 : mag.tech === 'lte' ? 2 : 1.5
          return (
            <line
              key={`link-lma-${mag.id}`}
              x1={lma.x} y1={lma.y}
              x2={mag.x} y2={mag.y}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray="8 4"
              className="animate-flow-dash"
              opacity={0.7}
            />
          )
        })}

        {mns.map((mn) => {
          const parentMag = mags.find((mag) => {
            const info = magSet.get(mag.id)
            return info && info.mns.includes(mn.id)
          })
          if (!parentMag) return null
          return (
            <line
              key={`link-mag-${mn.id}`}
              x1={parentMag.x} y1={parentMag.y}
              x2={mn.x} y2={mn.y}
              stroke="#1e3a5f"
              strokeWidth="1"
              strokeDasharray="4 4"
              className="animate-flow-dash"
            />
          )
        })}

        {tunnelLinks.map((t) => {
          const oldMagNode = mags.find((m) => m.id === t.old_mag)
          const newMagNode = mags.find((m) => m.id === t.new_mag)
          if (!oldMagNode || !newMagNode) return null
          const midY = (oldMagNode.y + newMagNode.y) / 2 - 20
          const midX = (oldMagNode.x + newMagNode.x) / 2
          return (
            <g key={`tunnel-${t.mn_id}`}>
              <path
                d={`M ${oldMagNode.x} ${oldMagNode.y - 20} Q ${midX} ${midY - 30} ${newMagNode.x} ${newMagNode.y - 20}`}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2"
                strokeDasharray="6 3"
                className="animate-flow-dash"
                markerEnd="url(#arrowYellow)"
                markerStart="url(#arrowYellow)"
              />
              <text x={midX} y={midY - 20} textAnchor="middle" fill="#f59e0b" fontSize="8" fontFamily="JetBrains Mono" fontWeight="600">
                {t.buffered} pkts
              </text>
              <text x={midX} y={midY - 10} textAnchor="middle" fill="#f59e0b80" fontSize="6" fontFamily="JetBrains Mono">
                ↔ bidirectional
              </text>
            </g>
          )
        })}

        {nodes.map((node) => (
          <g key={node.id}>
            {node.type === 'lma' && (
              <>
                <circle cx={node.x} cy={node.y} r="28" fill="#0a0f1e" stroke="#00ffc8" strokeWidth="2" filter="url(#glow)" />
                <circle cx={node.x} cy={node.y} r="20" fill="#00ffc820" />
                <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="middle" fill="#00ffc8" fontSize="10" fontFamily="Outfit" fontWeight="700">
                  {node.label}
                </text>
              </>
            )}
            {node.type === 'mag' && (
              <>
                <rect x={node.x - 36} y={node.y - 18} width="72" height="36" rx="8" fill="#0a0f1e" stroke={techStrokeColor(node.tech)} strokeWidth="1.5" />
                <text x={node.x} y={node.y - 3} textAnchor="middle" dominantBaseline="middle" fill={techStrokeColor(node.tech)} fontSize="8" fontFamily="JetBrains Mono" fontWeight="600">
                  {node.label}
                </text>
                <text x={node.x} y={node.y + 9} textAnchor="middle" dominantBaseline="middle" fill="#64748b" fontSize="6" fontFamily="JetBrains Mono">
                  {node.tech?.toUpperCase()}
                </text>
              </>
            )}
            {node.type === 'mn' && (
              <>
                <circle cx={node.x} cy={node.y} r="16" fill="#0a0f1e" stroke="#f59e0b" strokeWidth="1" />
                <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="middle" fill="#f59e0b" fontSize="8" fontFamily="JetBrains Mono" fontWeight="500">
                  {node.label}
                </text>
              </>
            )}
            <text
              x={node.x}
              y={node.type === 'lma' ? node.y + 44 : node.type === 'mag' ? node.y + 28 : node.y + 28}
              textAnchor="middle"
              fill="#64748b"
              fontSize="7"
              fontFamily="JetBrains Mono"
            >
              {node.sublabel}
            </text>
          </g>
        ))}

        {safeEntries.length === 0 && (
          <text x="300" y="160" textAnchor="middle" fill="#64748b" fontSize="12" fontFamily="Outfit">
            No active bindings
          </text>
        )}
      </svg>
    </div>
  )
}
