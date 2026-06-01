import ClusterTopology from '@/components/ClusterTopology'
import SyncProgress from '@/components/SyncProgress'
import LatencyMonitor from '@/components/LatencyMonitor'
import ConsistencyPanel from '@/components/ConsistencyPanel'
import OrphanPanel from '@/components/OrphanPanel'
import HistogramPanel from '@/components/HistogramPanel'
import ConflictPanel from '@/components/ConflictPanel'
import ControlBar from '@/components/ControlBar'
import { useWebSocket } from '@/hooks/useWebSocket'
import { Layers, Wifi, ShieldCheck, HardDrive, Trash2, BarChart3, GitBranch } from 'lucide-react'
import { useSimulatorStore } from '@/store'
import { useState } from 'react'

type Tab = 'orphan' | 'histogram' | 'conflict'

function Panel({
  title,
  icon: Icon,
  children,
  className = '',
  badge,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  className?: string
  badge?: React.ReactNode
}) {
  return (
    <div
      className={`rounded-xl border border-[#1A1F2E] bg-[#0D1117]/80 backdrop-blur-sm overflow-hidden flex flex-col ${className}`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1F2E] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-cyan-400/70" />
          <span className="text-xs font-mono text-gray-400 tracking-wider">{title}</span>
        </div>
        {badge}
      </div>
      <div className="p-4 flex-1 overflow-auto">{children}</div>
    </div>
  )
}

export default function Dashboard() {
  useWebSocket()
  const clusterStatus = useSimulatorStore((s) => s.clusterStatus)
  const roleSwitchData = useSimulatorStore((s) => s.roleSwitchData)
  const pendingWritesBlocked = useSimulatorStore((s) => s.pendingWritesBlocked)
  const isActiveActive = clusterStatus?.replication_mode === 'active_active'

  const [activeTab, setActiveTab] = useState<Tab>('histogram')

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'histogram', label: '延迟直方图', icon: BarChart3 },
    { key: 'conflict', label: '冲突检测', icon: GitBranch },
    { key: 'orphan', label: '数据保护', icon: Trash2 },
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1F2E] flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-mono font-bold text-gray-200 tracking-wide">
              RBD 镜像同步模拟器
            </h1>
            {isActiveActive && (
              <span className="px-2 py-0.5 text-[9px] font-mono bg-purple-400/20 text-purple-400 rounded-full border border-purple-400/30">
                ACTIVE-ACTIVE
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-600 font-mono mt-0.5">
            {isActiveActive
              ? '双活双向复制 · 冲突检测与自动解决'
              : '主集群 → 备集群 异步复制 · 网络延迟模拟 · 数据一致性检测'}
          </p>
        </div>
        <ControlBar />
      </div>

      {(roleSwitchData || pendingWritesBlocked) && (
        <div className={`px-6 py-2 border-b border-[#1A1F2E] text-[11px] font-mono flex items-center gap-3 flex-shrink-0 ${
          pendingWritesBlocked ? 'bg-amber-400/5 text-amber-400/80' : 'bg-purple-400/5 text-purple-400/80'
        }`}>
          {pendingWritesBlocked && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>FLUSHING: 新写入已阻塞，正在等待所有积压 IO 完成...</span>
            </>
          )}
          {roleSwitchData && !pendingWritesBlocked && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span>
                角色切换完成: {roleSwitchData.new_primary} → PRIMARY, {roleSwitchData.new_backup} → BACKUP
              </span>
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-4 auto-rows-fr min-h-[800px]">
          <Panel title="集群拓扑" icon={Layers} badge={
            clusterStatus && (
              <div className="flex items-center gap-2 text-[9px] font-mono">
                <span className="flex items-center gap-1 text-cyan-400/70">
                  <span className="w-1 h-1 rounded-full bg-cyan-400" />
                  {clusterStatus.primary.name}
                </span>
                <span className="text-gray-600">{isActiveActive ? '⇄' : '→'}</span>
                <span className="flex items-center gap-1 text-emerald-400/70">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  {clusterStatus.backup.name}
                </span>
              </div>
            )
          }>
            <ClusterTopology />
          </Panel>

          <Panel title="同步进度" icon={HardDrive}>
            <SyncProgress />
          </Panel>

          <Panel title="网络延迟监控" icon={Wifi}>
            <LatencyMonitor />
          </Panel>

          <Panel title="数据一致性检测" icon={ShieldCheck}>
            <ConsistencyPanel />
          </Panel>

          <div className="col-span-2 rounded-xl border border-[#1A1F2E] bg-[#0D1117]/80 backdrop-blur-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1F2E] flex-shrink-0">
              <div className="flex items-center gap-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono transition-all ${
                        activeTab === tab.key
                          ? 'bg-cyan-400/20 text-cyan-400'
                          : 'text-gray-500 hover:text-gray-400 hover:bg-[#1A1F2E]'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {tab.label}
                    </button>
                  )
                })}
              </div>
              {clusterStatus && activeTab === 'conflict' && (
                <div className="flex items-center gap-2 text-[9px] font-mono">
                  <span className="flex items-center gap-1 text-gray-500">
                    总冲突: <span className="text-gray-400">{clusterStatus.conflict_count}</span>
                  </span>
                  <span className="flex items-center gap-1 text-rose-400">
                    未解决: <span className="font-bold">{clusterStatus.unresolved_conflict_count}</span>
                  </span>
                </div>
              )}
            </div>
            <div className="p-4 flex-1 overflow-auto min-h-[300px]">
              {activeTab === 'orphan' && <OrphanPanel />}
              {activeTab === 'histogram' && <HistogramPanel />}
              {activeTab === 'conflict' && <ConflictPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
