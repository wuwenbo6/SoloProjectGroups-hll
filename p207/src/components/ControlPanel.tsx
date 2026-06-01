import { Play, Pause, RotateCcw, Settings, Zap, Radio, Clock } from 'lucide-react'
import type { SimulationStatus } from '../../shared/types'

interface ControlPanelProps {
  status: SimulationStatus | null
  isConnected: boolean
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onSetConfig: (config: Partial<{
    deviceCount?: number
    harvestRateMultiplier?: number
    energyThreshold?: number
    clockSpeedMultiplier?: number
  }>) => void
}

export function ControlPanel({
  status,
  isConnected,
  onStart,
  onPause,
  onReset,
  onSetConfig,
}: ControlPanelProps) {
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <Settings size={18} className="text-green-400" />
          模拟控制
        </h3>
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: isConnected ? '#00FF88' : '#FF3B5C' }}
          />
          <span className="text-sm text-gray-400">
            {isConnected ? '已连接' : '未连接'}
          </span>
        </div>
      </div>

      <div className="bg-gray-900/50 rounded-lg p-3 mb-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-gray-400 text-xs mb-1">运行时间</div>
            <div className="text-white font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {status ? formatDuration(status.elapsedTime) : '--:--'}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-xs mb-1">设备数量</div>
            <div className="text-white font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {status?.deviceCount || 0}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-xs mb-1">发送帧总数</div>
            <div className="text-white font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {status?.totalFramesSent || 0}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={onStart}
          disabled={status?.running || false}
          className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg font-medium transition-colors"
        >
          <Play size={16} />
          启动
        </button>
        <button
          onClick={onPause}
          disabled={!status?.running || false}
          className="flex-1 flex items-center justify-center gap-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg font-medium transition-colors"
        >
          <Pause size={16} />
          暂停
        </button>
        <button
          onClick={onReset}
          className="flex-1 flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded-lg font-medium transition-colors"
        >
          <RotateCcw size={16} />
          重置
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400 flex items-center gap-1">
              <Clock size={14} />
              时钟速度
            </label>
            <span className="text-sm text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {status?.config.clockSpeedMultiplier || 60}x
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="360"
            step="1"
            value={status?.config.clockSpeedMultiplier || 60}
            onChange={(e) => onSetConfig({ clockSpeedMultiplier: parseInt(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#00FF88' }}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400 flex items-center gap-1">
              <Zap size={14} />
              能量收集速率
            </label>
            <span className="text-sm text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {status?.config.harvestRateMultiplier || 1.0}x
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.5"
            value={status?.config.harvestRateMultiplier || 1.0}
            onChange={(e) => onSetConfig({ harvestRateMultiplier: parseFloat(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#00FF88' }}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400 flex items-center gap-1">
              <Radio size={14} />
              设备数量
            </label>
            <span className="text-sm text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {status?.config.deviceCount || 4}
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={status?.config.deviceCount || 4}
            onChange={(e) => onSetConfig({ deviceCount: parseInt(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#00FF88' }}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">唤醒阈值</label>
            <span className="text-sm text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {status?.config.energyThreshold || 80}%
            </span>
          </div>
          <input
            type="range"
            min="30"
            max="95"
            step="5"
            value={status?.config.energyThreshold || 80}
            onChange={(e) => onSetConfig({ energyThreshold: parseInt(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: '#00FF88' }}
          />
        </div>
      </div>
    </div>
  )
}
