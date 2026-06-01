import { useMemo } from 'react'
import { Wifi, Router } from 'lucide-react'
import type { GPDevice } from '../../shared/types'

interface NetworkTopologyProps {
  devices: GPDevice[]
}

export function NetworkTopology({ devices }: NetworkTopologyProps) {
  const centerX = 200
  const centerY = 150
  const coordinatorRadius = 40
  const deviceRadius = 25

  const devicePositions = useMemo(() => {
    const radius = 90
    return devices.map((device, index) => {
      const angle = (2 * Math.PI * index) / Math.max(devices.length, 1) - Math.PI / 2
      return {
        device,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      }
    })
  }, [devices])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sending': return '#00FF88'
      case 'waking': return '#FFB800'
      case 'recharging': return '#60A5FA'
      default: return '#6B7280'
    }
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
      <h3 className="font-bold text-white text-lg flex items-center gap-2 mb-4">
        <Router size={18} className="text-green-400" />
        网络拓扑
      </h3>

      <svg width="400" height="300" className="w-full h-auto">
        <defs>
          <radialGradient id="coordinatorGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00FF88" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00FF88" stopOpacity="0" />
          </radialGradient>
        </defs>

        {devicePositions.map(({ device, x, y }) => (
          <line
            key={`line-${device.deviceId}`}
            x1={centerX}
            y1={centerY}
            x2={x}
            y2={y}
            stroke={getStatusColor(device.status)}
            strokeWidth="1"
            strokeDasharray={device.status === 'sending' ? '0' : '4,4'}
            opacity={0.5}
            className={device.status === 'sending' ? 'animate-pulse' : ''}
          />
        ))}

        <circle cx={centerX} cy={centerY} r="60" fill="url(#coordinatorGlow)" />
        <circle
          cx={centerX}
          cy={centerY}
          r={coordinatorRadius}
          fill="#1F2937"
          stroke="#00FF88"
          strokeWidth="2"
        />
        <text
          x={centerX}
          y={centerY + 5}
          textAnchor="middle"
          fill="#00FF88"
          fontSize="12"
          fontWeight="bold"
          fontFamily="JetBrains Mono, monospace"
        >
          COORD
        </text>

        {devicePositions.map(({ device, x, y }) => (
          <g key={device.deviceId}>
            <circle
              cx={x}
              cy={y}
              r={deviceRadius}
              fill="#1F2937"
              stroke={getStatusColor(device.status)}
              strokeWidth="2"
              className={device.status === 'sending' ? 'animate-pulse' : ''}
            />
            <text
              x={x}
              y={y + 4}
              textAnchor="middle"
              fill={getStatusColor(device.status)}
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              {device.deviceId.split('-')[1]}
            </text>
          </g>
        ))}
      </svg>

      <div className="flex flex-wrap gap-3 mt-4 justify-center text-xs">
        <div className="flex items-center gap-1">
          <Wifi size={12} className="text-gray-500" />
          <span className="text-gray-400">休眠</span>
        </div>
        <div className="flex items-center gap-1">
          <Wifi size={12} className="text-blue-400" />
          <span className="text-gray-400">收集能量</span>
        </div>
        <div className="flex items-center gap-1">
          <Wifi size={12} className="text-yellow-400" />
          <span className="text-gray-400">唤醒中</span>
        </div>
        <div className="flex items-center gap-1">
          <Wifi size={12} className="text-green-400" />
          <span className="text-gray-400">发送中</span>
        </div>
      </div>
    </div>
  )
}
