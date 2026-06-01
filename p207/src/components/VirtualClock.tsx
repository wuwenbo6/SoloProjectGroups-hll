import { Clock, Sun, Moon, Cloud } from 'lucide-react'
import type { VirtualClock, LightModel } from '../../shared/types'

interface VirtualClockProps {
  clock: VirtualClock | null
  light: LightModel | null
}

export function VirtualClockDisplay({ clock, light }: VirtualClockProps) {
  if (!clock || !light) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
        <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
          <Clock size={18} className="text-green-400" />
          虚拟时钟
        </h4>
        <div className="text-center text-gray-500">
          等待连接...
        </div>
      </div>
    )
  }

  const getTimeIcon = () => {
    return light.isDaytime ? <Sun size={16} className="text-yellow-400" /> : <Moon size={16} className="text-blue-400" />
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-white flex items-center gap-2">
          <Clock size={18} className="text-green-400" />
          虚拟时钟
        </h4>
        <div className="flex items-center gap-2">
          {getTimeIcon()}
          <span
            className="text-xs px-2 py-1 rounded"
            style={{
              backgroundColor: light.isDaytime ? 'rgba(251, 191, 36, 0.2)' : 'rgba(96, 165, 250, 0.2)',
              color: light.isDaytime ? '#FBBF24' : '#60A5FA',
            }}
          >
            {light.isDaytime ? '白天' : '夜间'}
          </span>
        </div>
      </div>

      <div className="text-center mb-4">
        <div className="text-4xl font-bold text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {clock.formattedTime}
        </div>
        <div className="text-xs text-gray-400 mt-1">
          速度: {clock.speedMultiplier}x 实时
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Sun size={14} className="text-yellow-400" />
            <span className="text-gray-400">光照强度</span>
          </div>
          <span className="text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {light.currentIntensity.toFixed(1)}%
          </span>
        </div>

        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: `${light.currentIntensity}%`,
              background: 'linear-gradient(to right, #1e3a5f, #fbbf24)'
            }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>云层: {(light.cloudFactor * 100).toFixed(0)}%</span>
          <Cloud size={12} className="text-gray-400" />
        </div>
      </div>
    </div>
  )
}
