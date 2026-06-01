import { useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import type { EnergyHistoryPoint, GPDevice } from '../../shared/types'

interface EnergyChartProps {
  device: GPDevice
  width?: number
  height?: number
}

export function EnergyChart({ device, width = 600, height = 200 }: EnergyChartProps) {
  const padding = { top: 20, right: 60, bottom: 30, left: 40 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const { energyPath, lightPath, thresholdLine } = useMemo(() => {
    const history = device.energyHistory

    if (history.length < 2) {
      return { energyPath: '', lightPath: '', thresholdLine: '' }
    }

    const minTime = Math.min(...history.map((p) => p.simulatedTime))
    const maxTime = Math.max(...history.map((p) => p.simulatedTime))
    const timeRange = maxTime - minTime || 1

    const pointsToPath = (getValue: (p: EnergyHistoryPoint) => number) => {
      return history
        .map((point, index) => {
          const x = padding.left + ((point.simulatedTime - minTime) / timeRange) * chartWidth
          const y = padding.top + chartHeight - (getValue(point) / 100) * chartHeight
          return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
        })
        .join(' ')
    }

    const energyPath = pointsToPath((p) => p.energyLevel)
    const lightPath = pointsToPath((p) => p.lightIntensity)

    const thresholdY = padding.top + chartHeight - (device.threshold / 100) * chartHeight
    const thresholdLine = `M ${padding.left} ${thresholdY} L ${padding.left + chartWidth} ${thresholdY}`

    return { energyPath, lightPath, thresholdLine }
  }, [device.energyHistory, device.threshold, chartWidth, chartHeight, padding])

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  }

  const currentTime =
    device.energyHistory.length > 0
      ? device.energyHistory[device.energyHistory.length - 1].simulatedTime
      : 0

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-white flex items-center gap-2">
          <TrendingUp size={16} className="text-green-400" />
          能量积累曲线
        </h4>
        <span className="text-xs text-gray-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {device.deviceId}
        </span>
      </div>

      <svg width={width} height={height} className="w-full h-auto">
        <defs>
          <linearGradient id="energyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00FF88" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#00FF88" stopOpacity={0} />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((value) => (
          <g key={value}>
            <line
              x1={padding.left}
              y1={padding.top + chartHeight - (value / 100) * chartHeight}
              x2={padding.left + chartWidth}
              y2={padding.top + chartHeight - (value / 100) * chartHeight}
              stroke="rgba(255,255,255,0.1)"
              strokeDasharray="2,2"
            />
            <text
              x={padding.left - 5}
              y={padding.top + chartHeight - (value / 100) * chartHeight + 4}
              fill="rgba(255,255,255,0.5)"
              fontSize={10}
              textAnchor="end"
            >
              {value}%
            </text>
          </g>
        ))}

        <path
          d={thresholdLine}
          stroke="#FFB800"
          strokeWidth={1}
          strokeDasharray="4,4"
          opacity={0.6}
        />

        <path
          d={lightPath}
          fill="none"
          stroke="#FBBF24"
          strokeWidth={1.5}
          opacity={0.6}
        />

        <path
          d={energyPath}
          fill="none"
          stroke="#00FF88"
          strokeWidth={2}
        />

        <path
          d={`${energyPath} L ${padding.left + chartWidth} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`}
          fill="url(#energyGradient)"
        />

        <text x={padding.left + chartWidth + 5} y={padding.top + 5} fill="#00FF88" fontSize={10}>
          能量
        </text>
        <text x={padding.left + chartWidth + 5} y={padding.top + 20} fill="#FBBF24" fontSize={10}>
          光照
        </text>
        <text
          x={padding.left + chartWidth + 5}
          y={padding.top + chartHeight - (device.threshold / 100) * chartHeight + 4}
          fill="#FFB800"
          fontSize={10}
        >
          阈值 {device.threshold}%
        </text>

        <text
          x={width / 2}
          y={height - 5}
          fill="rgba(255,255,255,0.5)"
          fontSize={10}
          textAnchor="middle"
        >
          模拟时间 {formatTime(currentTime)}
        </text>
      </svg>
    </div>
  )
}
