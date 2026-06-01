import { useSimulatorStore } from '@/store'
import { HardDrive, Zap, Clock } from 'lucide-react'

export default function SyncProgress() {
  const images = useSimulatorStore((s) => s.images)
  const simState = useSimulatorStore((s) => s.simState)
  const pendingSyncQueue = useSimulatorStore((s) => s.pendingSyncQueue)

  if (images.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm">
        <HardDrive className="w-4 h-4 mr-2" />
        等待同步数据
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {images.map((img) => {
        const pct = img.progress
        const rate = img.synced_blocks > 0 ? (img.synced_blocks / img.total_blocks * 100).toFixed(1) : '0.0'
        return (
          <div key={img.image_id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="text-xs font-mono text-gray-300">{img.image_name}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono text-gray-500">
                <span>{img.synced_blocks}/{img.total_blocks} blocks</span>
                <span className="text-cyan-400">{rate}%</span>
              </div>
            </div>
            <div className="h-2 bg-[#1A1F2E] rounded-full overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                style={{
                  width: `${pct}%`,
                  background: 'linear-gradient(90deg, #00F0FF, #00FF88)',
                }}
              >
                {simState === 'running' && (
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(255,255,255,0.15) 8px, rgba(255,255,255,0.15) 16px)',
                      animation: 'scanLine 1s linear infinite',
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )
      })}
      {pendingSyncQueue > 0 && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-amber-400/80 pt-1">
          <Clock className="w-3 h-3" />
          <span>队列中等待同步: {pendingSyncQueue} 块</span>
        </div>
      )}
    </div>
  )
}
