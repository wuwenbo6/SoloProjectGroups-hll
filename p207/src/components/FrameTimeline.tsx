import { useState } from 'react'
import { ArrowRight, Shield, Radio } from 'lucide-react'
import type { GPFrame } from '../../shared/types'

interface FrameTimelineProps {
  frames: GPFrame[]
}

const frameTypeLabels: Record<string, { label: string; color: string }> = {
  notification: { label: '通知', color: '#00FF88' },
  commissioning: { label: '配网', color: '#60A5FA' },
  decommissioning: { label: '解除配网', color: '#F472B6' },
  success: { label: '成功', color: '#34D399' },
  channel_request: { label: '信道请求', color: '#FBBF24' },
}

export function FrameTimeline({ frames }: FrameTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('zh-CN', { hour12: false })
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 h-full flex flex-col">
      <div className="p-4 border-b border-gray-700/50">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <Radio size={18} className="text-green-400" />
          报文时间线
          <span className="text-sm font-normal text-gray-400 ml-2">
            ({frames.length})
          </span>
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {frames.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            暂无报文数据
          </div>
        ) : (
          frames.map((frame) => {
            const typeInfo = frameTypeLabels[frame.frameType] || { label: frame.frameType, color: '#6B7280' }
            const isExpanded = expandedId === frame.id

            return (
              <div
                key={frame.id}
                className="relative pl-4 pb-3 border-l-2 border-gray-700 last:border-transparent last:pb-0"
              >
                <div
                  className="absolute -left-[5px] top-0 w-2 h-2 rounded-full"
                  style={{ backgroundColor: typeInfo.color }}
                />

                <div
                  className="bg-gray-900/50 rounded-lg p-3 cursor-pointer hover:bg-gray-900/80 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : frame.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: typeInfo.color + '20', color: typeInfo.color }}
                      >
                        {typeInfo.label}
                      </span>
                      <span className="text-gray-400 text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {frame.deviceId}
                      </span>
                    </div>
                    <span className="text-gray-500 text-xs">
                      {formatTime(frame.timestamp)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                    <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      #{frame.sequenceNumber}
                    </span>
                    <ArrowRight size={10} />
                    <span>CH {frame.channel}</span>
                    <span>|</span>
                    <span>{frame.rssi} dBm</span>
                  </div>

                  <div
                    className="text-xs rounded px-2 py-1"
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      backgroundColor: 'rgba(0, 255, 136, 0.1)',
                      color: '#00FF88'
                    }}
                  >
                    0x{frame.payload}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Shield size={12} />
                        <span>安全等级: L{frame.securityLevel}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        帧 ID: {frame.id}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
