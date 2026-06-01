import { useSimulatorStore } from '@/store'
import { Server, HardDrive, Database, ArrowRight } from 'lucide-react'

function ClusterNode({ name, osds, isPrimary }: { name: string; osds: string[]; isPrimary: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative w-36 rounded-xl border p-4 transition-all duration-500 ${
          isPrimary
            ? 'border-cyan-400/30 bg-cyan-400/5 shadow-[0_0_20px_rgba(0,240,255,0.08)]'
            : 'border-emerald-400/30 bg-emerald-400/5 shadow-[0_0_20px_rgba(52,211,153,0.08)]'
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <Server className={`w-4 h-4 ${isPrimary ? 'text-cyan-400' : 'text-emerald-400'}`} />
          <span className="text-xs font-mono font-semibold tracking-wider">
            {isPrimary ? 'PRIMARY' : 'BACKUP'}
          </span>
        </div>
        <div className="text-xs text-gray-500 mb-2">{name}</div>
        <div className="grid grid-cols-3 gap-1.5">
          {osds.slice(0, 9).map((osd, i) => (
            <div
              key={osd}
              className={`w-8 h-8 rounded-md border flex items-center justify-center text-[9px] font-mono transition-all duration-300 ${
                isPrimary
                  ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300'
                  : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
              }`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {i}
            </div>
          ))}
          {osds.length > 9 && (
            <div className="w-8 h-8 rounded-md border border-gray-700 bg-gray-800 flex items-center justify-center text-[9px] font-mono text-gray-500">
              +{osds.length - 9}
            </div>
          )}
        </div>
        <div className="absolute -top-1 -right-1">
          <HardDrive
            className={`w-3.5 h-3.5 ${isPrimary ? 'text-cyan-400/60' : 'text-emerald-400/60'}`}
          />
        </div>
      </div>
    </div>
  )
}

export default function ClusterTopology() {
  const clusterStatus = useSimulatorStore((s) => s.clusterStatus)
  const simState = useSimulatorStore((s) => s.simState)
  const images = useSimulatorStore((s) => s.images)

  if (!clusterStatus) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm">
        <Database className="w-4 h-4 mr-2" />
        启动模拟以查看集群拓扑
      </div>
    )
  }

  const isSyncing = simState === 'running'

  return (
    <div className="flex items-center justify-center gap-6 py-4">
      <ClusterNode name={clusterStatus.primary.name} osds={clusterStatus.primary.osds} isPrimary />
      <div className="flex flex-col items-center gap-1 min-w-[100px]">
        <div className="flex items-center gap-1">
          {images.map((img) => (
            <div key={img.image_id} className="flex flex-col items-center">
              <div className="text-[9px] font-mono text-gray-500 mb-0.5 truncate max-w-[60px]">
                {img.image_name}
              </div>
              <div className="h-px w-8 bg-gray-700 relative overflow-hidden">
                {isSyncing && (
                  <div
                    className="absolute inset-y-0 left-0 w-3 bg-cyan-400/60 animate-pulse"
                    style={{ animation: 'dataFlow 1.2s ease-in-out infinite' }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <ArrowRight
          className={`w-5 h-5 ${isSyncing ? 'text-cyan-400 animate-pulse' : 'text-gray-600'}`}
        />
        <div className="text-[9px] font-mono text-gray-600">
          {isSyncing ? 'ASYNC REPLICATION' : 'IDLE'}
        </div>
      </div>
      <ClusterNode name={clusterStatus.backup.name} osds={clusterStatus.backup.osds} isPrimary={false} />
    </div>
  )
}
