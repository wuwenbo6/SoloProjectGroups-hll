import { useState, useEffect } from 'react'
import { useSimulatorStore } from '@/store'
import { AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import type { Conflict } from '@/types'

const API_BASE = '/api'

export default function ConflictPanel() {
  const clusterStatus = useSimulatorStore((s) => s.clusterStatus)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('all')

  const fetchConflicts = async () => {
    setLoading(true)
    try {
      const resolvedParam = filter === 'all' ? '' : filter === 'resolved' ? 'true' : 'false'
      const url = resolvedParam ? `${API_BASE}/conflicts?resolved=${resolvedParam}` : `${API_BASE}/conflicts`
      const res = await fetch(url)
      const data = await res.json()
      setConflicts(data.conflicts || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    if (clusterStatus?.replication_mode === 'active_active') {
      fetchConflicts()
      const interval = setInterval(fetchConflicts, 3000)
      return () => clearInterval(interval)
    }
  }, [clusterStatus?.replication_mode, filter])

  const handleResolve = async (conflictId: string, winner: string) => {
    try {
      await fetch(`${API_BASE}/conflicts/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conflict_id: conflictId, winner }),
      })
      await fetchConflicts()
    } catch {}
  }

  if (clusterStatus?.replication_mode !== 'active_active') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-600">
        <AlertTriangle className="w-8 h-8 mb-2 opacity-30" />
        <div className="text-[10px] font-mono">仅双活模式可用</div>
        <div className="text-[9px] font-mono mt-1">切换到 Active-Active 模式后启用冲突检测</div>
      </div>
    )
  }

  const unresolved = conflicts.filter((c) => !c.resolved)
  const resolved = conflicts.filter((c) => c.resolved)

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <StatBadge label="总冲突" value={conflicts.length} color="gray" />
          <StatBadge label="未解决" value={unresolved.length} color="rose" highlight={unresolved.length > 0} />
          <StatBadge label="已解决" value={resolved.length} color="emerald" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md overflow-hidden border border-[#1A1F2E]">
            {(['all', 'unresolved', 'resolved'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 text-[10px] font-mono transition-colors ${
                  filter === f
                    ? 'bg-cyan-400/20 text-cyan-400'
                    : 'text-gray-500 hover:text-gray-400'
                }`}
              >
                {f === 'all' ? '全部' : f === 'unresolved' ? '未解决' : '已解决'}
              </button>
            ))}
          </div>
          <button
            onClick={fetchConflicts}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-gray-400 hover:text-cyan-400 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {conflicts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
          <CheckCircle className="w-8 h-8 mb-2 opacity-30" />
          <div className="text-[10px] font-mono">暂无冲突</div>
          <div className="text-[9px] font-mono mt-1">数据同步正常</div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto space-y-2 pr-1">
          {conflicts.slice(0, 20).map((conflict) => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              clusterA={clusterStatus?.primary?.name || 'cluster-a'}
              clusterB={clusterStatus?.backup?.name || 'cluster-b'}
              onResolve={handleResolve}
            />
          ))}
          {conflicts.length > 20 && (
            <div className="text-center text-[9px] font-mono text-gray-600 py-2">
              ... 还有 {conflicts.length - 20} 条冲突记录
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ConflictCard({
  conflict,
  clusterA,
  clusterB,
  onResolve,
}: {
  conflict: Conflict
  clusterA: string
  clusterB: string
  onResolve: (id: string, winner: string) => void
}) {
  const timeA = new Date(conflict.detected_at * 1000).toLocaleTimeString()

  return (
    <div className={`p-3 rounded-lg border ${conflict.resolved ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-rose-400/20 bg-rose-400/5'}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {conflict.resolved ? (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          )}
          <span className="text-[10px] font-mono text-gray-400">
            冲突 #{conflict.id} · {conflict.image_id} · Block #{conflict.block_index}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[9px] font-mono text-gray-600">
          <Clock className="w-2.5 h-2.5" />
          {timeA}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <VersionBlock
          cluster={clusterA}
          version={conflict.cluster_a_version}
          hash={conflict.cluster_a_hash}
          isWinner={conflict.winner === clusterA}
        />
        <VersionBlock
          cluster={clusterB}
          version={conflict.cluster_b_version}
          hash={conflict.cluster_b_hash}
          isWinner={conflict.winner === clusterB}
        />
      </div>

      {!conflict.resolved && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onResolve(conflict.id, clusterA)}
            className="flex-1 px-2 py-1 text-[9px] font-mono text-cyan-400 bg-cyan-400/10 hover:bg-cyan-400/20 rounded-md transition-colors"
          >
            采纳 {clusterA}
          </button>
          <button
            onClick={() => onResolve(conflict.id, clusterB)}
            className="flex-1 px-2 py-1 text-[9px] font-mono text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 rounded-md transition-colors"
          >
            采纳 {clusterB}
          </button>
        </div>
      )}

      {conflict.resolved && conflict.winner && (
        <div className="text-[9px] font-mono text-emerald-400/70 text-center">
          已采纳 {conflict.winner} 版本 · {conflict.resolution}
        </div>
      )}
    </div>
  )
}

function VersionBlock({
  cluster,
  version,
  hash,
  isWinner,
}: {
  cluster: string
  version: number
  hash: string
  isWinner: boolean
}) {
  return (
    <div className={`p-2 rounded-md ${isWinner ? 'bg-cyan-400/10 border border-cyan-400/30' : 'bg-[#1A1F2E]'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-mono text-gray-500">{cluster}</span>
        {isWinner && <span className="text-[8px] font-mono text-cyan-400">✓ 获胜</span>}
      </div>
      <div className="text-xs font-mono text-gray-300">v{version}</div>
      <div className="text-[8px] font-mono text-gray-600 truncate">{hash}</div>
    </div>
  )
}

function StatBadge({
  label,
  value,
  color,
  highlight = false,
}: {
  label: string
  value: number
  color: 'gray' | 'rose' | 'emerald'
  highlight?: boolean
}) {
  const colors = {
    gray: 'text-gray-400 border-gray-600',
    rose: 'text-rose-400 border-rose-400/50',
    emerald: 'text-emerald-400 border-emerald-400/50',
  }
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border ${colors[color]} ${highlight ? 'animate-pulse' : ''}`}>
      <span className="text-[9px] font-mono opacity-70">{label}</span>
      <span className="text-[10px] font-mono font-bold">{value}</span>
    </div>
  )
}
