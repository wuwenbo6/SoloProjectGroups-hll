import { useMemo } from 'react'
import { useTcpStore } from '@/store/useTcpStore'
import { CONGESTION_PHASE_NAMES, CONGESTION_PHASE_COLORS } from '@/types/congestion'
import { TrendingUp } from 'lucide-react'

const maxCwnd = 100
const chartWidth = 340
const chartHeight = 140
const padding = { top: 10, right: 10, bottom: 20, left: 30 }
const innerWidth = chartWidth - padding.left - padding.right
const innerHeight = chartHeight - padding.top - padding.bottom

export default function CongestionChart() {
  const congestionHistory = useTcpStore((s) => s.congestionHistory)
  const congestionState = useTcpStore((s) => s.congestionState)

  const { points, ssthreshY, areaPath, linePath } = useMemo(() => {
    const history = congestionHistory.slice(-30)
    const points: { x: number; y: number; cwnd: number }[] = []

    if (history.length === 0) {
      const defaultY = padding.top + innerHeight - (congestionState.cwnd / maxCwnd) * innerHeight
      return {
        points: [{ x: padding.left, y: defaultY, cwnd: congestionState.cwnd }],
        ssthreshY: padding.top + innerHeight - (congestionState.ssthresh / maxCwnd) * innerHeight,
        areaPath: '',
        linePath: '',
      }
    }

    const step = history.length > 1 ? innerWidth / (history.length - 1) : 0

    history.forEach((record, i) => {
      const x = padding.left + i * step
      const y = padding.top + innerHeight - (record.cwnd / maxCwnd) * innerHeight
      points.push({ x, y, cwnd: record.cwnd })
    })

    let linePath = ''
    let areaPath = ''

    if (points.length > 0) {
      linePath = `M ${points[0].x} ${points[0].y}`
      areaPath = `M ${points[0].x} ${padding.top + innerHeight}`
      areaPath += ` L ${points[0].x} ${points[0].y}`

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const cpx = (prev.x + curr.x) / 2
        linePath += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`
        areaPath += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`
      }

      areaPath += ` L ${points[points.length - 1].x} ${padding.top + innerHeight} Z`
    }

    const ssthreshY = padding.top + innerHeight - (congestionState.ssthresh / maxCwnd) * innerHeight

    return { points, ssthreshY, areaPath, linePath }
  }, [congestionHistory, congestionState])

  const yTicks = useMemo(() => {
    const ticks = []
    for (let i = 0; i <= 4; i++) {
      const value = (maxCwnd / 4) * i
      const y = padding.top + innerHeight - (value / maxCwnd) * innerHeight
      ticks.push({ value, y })
    }
    return ticks
  }, [])

  const phaseColor = CONGESTION_PHASE_COLORS[congestionState.phase]

  return (
    <div className="absolute top-6 right-6 w-[380px] z-10">
      <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm">拥塞控制</h2>
            <p className="text-white/40 text-xs">cwnd 实时变化</p>
          </div>
        </div>

        <svg
          width={chartWidth}
          height={chartHeight}
          className="overflow-visible"
        >
          <defs>
            <linearGradient id="chartBg" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="cwndGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00e5ff" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect
            x={padding.left}
            y={padding.top}
            width={innerWidth}
            height={innerHeight}
            fill="url(#chartBg)"
            rx="4"
          />

          {yTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={chartWidth - padding.right}
                y2={tick.y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 5}
                y={tick.y + 3}
                fill="rgba(255,255,255,0.3)"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
                textAnchor="end"
              >
                {tick.value}
              </text>
            </g>
          ))}

          <line
            x1={padding.left}
            y1={ssthreshY}
            x2={chartWidth - padding.right}
            y2={ssthreshY}
            stroke="#ffab00"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.7"
          />
          <text
            x={chartWidth - padding.right}
            y={ssthreshY - 5}
            fill="#ffab00"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="end"
            opacity="0.7"
          >
            ssthresh={congestionState.ssthresh}
          </text>

          {areaPath && (
            <path
              d={areaPath}
              fill="url(#chartBg)"
              opacity="0.5"
              className="transition-all duration-500"
            />
          )}

          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="url(#cwndGradient)"
              strokeWidth="2"
              filter="url(#glow)"
              className="transition-all duration-500"
            />
          )}

          {points.length > 0 && (
            <>
              {points.map((point, i) => (
                <circle
                  key={i}
                  cx={point.x}
                  cy={point.y}
                  r="2"
                  fill="#00e5ff"
                  opacity={i === points.length - 1 ? 1 : 0.5}
                  className="transition-all duration-500"
                />
              ))}
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r="4"
                fill="#00e5ff"
                filter="url(#glow)"
                className="transition-all duration-500"
              >
                <animate attributeName="r" values="4;6;4" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0.6;1" dur="1.5s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          <text
            x={padding.left}
            y={chartHeight - 5}
            fill="rgba(255,255,255,0.3)"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
          >
            0
          </text>
          <text
            x={chartWidth - padding.right}
            y={chartHeight - 5}
            fill="rgba(255,255,255,0.3)"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="end"
          >
            {points.length - 1}
          </text>
        </svg>

        <div className="mt-3 flex items-center gap-3">
          <div
            className="px-2.5 py-1 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: `${phaseColor}20`,
              color: phaseColor,
              border: `1px solid ${phaseColor}40`,
            }}
          >
            {CONGESTION_PHASE_NAMES[congestionState.phase]}
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-white/40">cwnd:</span>
              <span className="font-mono text-cyan-400 font-semibold">{congestionState.cwnd}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white/40">ssthresh:</span>
              <span className="font-mono text-amber-400 font-semibold">{congestionState.ssthresh}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white/40">dupacks:</span>
              <span className="font-mono text-purple-400 font-semibold">{congestionState.dupacks}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
