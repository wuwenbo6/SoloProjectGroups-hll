import { useState } from 'react'
import { useSimulatorStore } from '@/store'
import { Trash2, Camera, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

export default function OrphanPanel() {
  const clusterStatus = useSimulatorStore((s) => s.clusterStatus)
  const orphanCleanupData = useSimulatorStore((s) => s.orphanCleanupData)
  const snapshotData = useSimulatorStore((s) => s.snapshotData)
  const simState = useSimulatorStore((s) => s.simState)
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [showOrphans, setShowOrphans] = useState(false)

  if (!clusterStatus) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm">
        <Trash2 className="w-4 h-4 mr-2" />
        启动模拟以查看数据保护状态
      </div>
    )
  }

  const orphanCount = clusterStatus.backup.orphan_count || 0
  const primarySnapshots = clusterStatus.primary.snapshot_count
  const backupSnapshots = clusterStatus.backup.snapshot_count

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-amber-400/70 mb-1">
            <AlertTriangle className="w-3 h-3" />
            孤儿对象
          </div>
          <div className="text-xl font-mono font-bold text-amber-400">{orphanCount}</div>
          <div className="text-[9px] text-gray-600 font-mono">备集群</div>
        </div>
        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-cyan-400/70 mb-1">
            <Camera className="w-3 h-3" />
            主快照
          </div>
          <div className="text-xl font-mono font-bold text-cyan-400">{primarySnapshots}</div>
          <div className="text-[9px] text-gray-600 font-mono">主集群</div>
        </div>
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/70 mb-1">
            <Camera className="w-3 h-3" />
            备快照
          </div>
          <div className="text-xl font-mono font-bold text-emerald-400">{backupSnapshots}</div>
          <div className="text-[9px] text-gray-600 font-mono">备集群</div>
        </div>
      </div>

      {orphanCleanupData && orphanCleanupData.found > 0 && (
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-amber-400/80">
              最近清理: 发现 {orphanCleanupData.found} 个, 清理 {orphanCleanupData.cleaned} 个
            </span>
            <button
              onClick={() => setShowOrphans(!showOrphans)}
              className="text-[10px] text-gray-500 hover:text-gray-300"
            >
              {showOrphans ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
          {showOrphans && orphanCleanupData.orphans.length > 0 && (
            <div className="mt-2 max-h-24 overflow-auto space-y-0.5">
              {orphanCleanupData.orphans.slice(0, 15).map((o, i) => (
                <div key={i} className="text-[10px] font-mono text-gray-500">
                  Image {o.image_id.slice(0, 6)} · Block #{o.block_index}
                </div>
              ))}
              {orphanCleanupData.orphans.length > 15 && (
                <div className="text-[9px] text-gray-600">... 还有 {orphanCleanupData.orphans.length - 15} 个</div>
              )}
            </div>
          )}
        </div>
      )}

      {snapshotData && (
        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-cyan-400/80">
              最近快照: 创建 {snapshotData.count} 个
            </span>
            <button
              onClick={() => setShowSnapshots(!showSnapshots)}
              className="text-[10px] text-gray-500 hover:text-gray-300"
            >
              {showSnapshots ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
          {showSnapshots && (
            <div className="mt-2 space-y-1">
              {snapshotData.snapshots.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-gray-500">{s.image_name}</span>
                  <span className="text-cyan-400/60">{s.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {simState !== 'idle' && orphanCount === 0 && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-400/70">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          备集群数据保护正常，无孤儿对象
        </div>
      )}

      {simState !== 'idle' && orphanCount > 0 && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-amber-400/70">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          检测到孤儿对象，将在下次清理周期自动处理
        </div>
      )}
    </div>
  )
}
