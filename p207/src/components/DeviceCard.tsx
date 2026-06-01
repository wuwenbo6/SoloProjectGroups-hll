import { Battery, Wifi, Activity, Clock, Sun } from 'lucide-react'
import type { GPDevice } from '../../shared/types'
import { EnergyRing } from './EnergyRing'

interface DeviceCardProps {
  device: GPDevice
  isSelected?: boolean
  onSelect?: () => void
}

const statusLabels: Record<string, { label: string; color: string }> = {
  sleeping: { label: '休眠', color: '#6B7280' },
  waking: { label: '唤醒中', color: '#FFB800' },
  sending: { label: '发送中', color: '#00FF88' },
  recharging: { label: '能量收集', color: '#60A5FA' },
}

export function DeviceCard({ device, isSelected = false, onSelect }: DeviceCardProps) {
  const status = statusLabels[device.status] || statusLabels.sleeping

  const formatTime = (ms: number) => {
    const seconds = Math.floor((Date.now() - ms) / 1000)
    if (seconds < 60) return `${seconds}秒前`
    return `${Math.floor(seconds / 60)}分钟前`
  }

  return (
    <div
      className={`bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border transition-all duration-300 cursor-pointer ${
        isSelected
          ? 'border-green-400 shadow-lg shadow-green-400/20'
          : 'border-gray-700/50 hover:border-gray-600/50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-white text-lg" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {device.deviceId}
          </h3>
          <div className="flex items-center gap-1 mt-1">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: status.color }}
            />
            <span className="text-sm" style={{ color: status.color }}>
              {status.label}
            </span>
          </div>
        </div>
        <EnergyRing energyLevel={device.energyLevel} status={device.status} size={72} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Wifi size={14} />
          <span>{device.signalStrength} dBm</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Activity size={14} />
          <span>{device.totalFramesSent} 帧</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Sun size={14} />
          <span>{device.currentLightIntensity.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Clock size={14} />
          <span>{formatTime(device.lastActiveAt)}</span>
        </div>
      </div>
    </div>
  )
}
