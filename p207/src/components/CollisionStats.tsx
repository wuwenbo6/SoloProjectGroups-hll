import { AlertTriangle, RefreshCw, Radio } from 'lucide-react'
import type { CollisionStats } from '../../shared/types'

interface CollisionStatsProps {
  stats: CollisionStats | null
}

const ZIGBEE_CHANNELS = [11, 15, 20, 25]

export function CollisionStatsPanel({ stats }: CollisionStatsProps) {
  if (!stats) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
        <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-400" />
          信道碰撞统计
        </h4>
        <div className="text-center text-gray-500">等待数据...</div>
      </div>
    )
  }

  const maxChannelCollisions = Math.max(...Object.values(stats.channelCollisions), 1)

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
      <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
        <AlertTriangle size={18} className="text-red-400" />
        信道碰撞统计
      </h4>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-red-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {stats.totalCollisions}
          </div>
          <div className="text-xs text-gray-400">总碰撞数</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {stats.totalRetries}
          </div>
          <div className="text-xs text-gray-400">重传次数</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {(stats.collisionRate * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-gray-400">碰撞率</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Radio size={14} />
          <span>信道负载分布</span>
        </div>

        {ZIGBEE_CHANNELS.map((channel) => {
          const collisions = stats.channelCollisions[channel] || 0
          const percentage = (collisions / maxChannelCollisions) * 100

          return (
            <div key={channel} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">信道 {channel}</span>
                <span className="text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {collisions}
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: collisions > 0 ? '#FF3B5C' : '#00FF88',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {Object.keys(stats.deviceCollisions).length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
            <RefreshCw size={14} />
            <span>设备碰撞次数</span>
          </div>
          <div className="space-y-1">
            {Object.entries(stats.deviceCollisions)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([deviceId, count]) => (
                <div key={deviceId} className="flex justify-between text-xs">
                  <span className="text-gray-400">{deviceId}</span>
                  <span className="text-red-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
