import { useState } from 'react'
import { useSimulatorStore } from '@/store'
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react'
import type { BlockMismatch } from '@/types'

function BlockGrid({
  totalBlocks,
  mismatches,
}: {
  totalBlocks: number
  mismatches: BlockMismatch[]
}) {
  const mismatchSet = new Set(mismatches.map((m) => m.block_index))
  const cols = Math.ceil(Math.sqrt(totalBlocks))
  const maxDisplay = 256
  const displayBlocks = Math.min(totalBlocks, maxDisplay)

  return (
    <div
      className="grid gap-[2px] p-2"
      style={{ gridTemplateColumns: `repeat(${Math.min(cols, 16)}, 1fr)` }}
    >
      {Array.from({ length: displayBlocks }, (_, i) => {
        const isInconsistent = mismatchSet.has(i)
        return (
          <div
            key={i}
            className={`aspect-square rounded-[2px] transition-all duration-300 ${
              isInconsistent
                ? 'bg-red-500/80 shadow-[0_0_4px_rgba(239,68,68,0.5)] animate-pulse'
                : 'bg-emerald-500/20'
            }`}
            title={isInconsistent ? `Block ${i}: 不一致` : `Block ${i}: 一致`}
          />
        )
      })}
    </div>
  )
}

export default function ConsistencyPanel() {
  const consistencyData = useSimulatorStore((s) => s.consistencyData)
  const images = useSimulatorStore((s) => s.images)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)

  if (!consistencyData) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm">
        <ShieldCheck className="w-4 h-4 mr-2" />
        等待一致性检测结果
      </div>
    )
  }

  const hasMismatches = consistencyData.total_mismatches > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {hasMismatches ? (
            <ShieldAlert className="w-4 h-4 text-red-400" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          )}
          <span className="text-xs font-mono">
            {hasMismatches ? '检测到数据不一致' : '数据一致'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-gray-500">
          不一致块: {consistencyData.total_mismatches}
        </span>
      </div>

      {consistencyData.results.map((result) => {
        const img = images.find((i) => i.image_id === result.image_id)
        const isExpanded = expandedImage === result.image_id
        return (
          <div key={result.image_id} className="space-y-2">
            <button
              onClick={() => setExpandedImage(isExpanded ? null : result.image_id)}
              className="w-full flex items-center justify-between text-xs font-mono text-gray-400 hover:text-gray-200 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    result.mismatch_count > 0 ? 'bg-red-400' : 'bg-emerald-400'
                  }`}
                />
                <span>{result.image_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px]">{result.mismatch_count} 差异</span>
                {isExpanded ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </div>
            </button>
            {isExpanded && (
              <BlockGrid
                totalBlocks={img?.total_blocks || 256}
                mismatches={result.mismatches}
              />
            )}
            {isExpanded && result.mismatches.length > 0 && (
              <div className="max-h-24 overflow-auto rounded border border-red-400/20 bg-red-400/5 p-2">
                {result.mismatches.slice(0, 10).map((m) => (
                  <div key={m.block_index} className="text-[9px] font-mono text-red-300/80">
                    Block #{m.block_index}: 主={m.primary_hash.slice(0, 8)} 备=
                    {m.backup_hash.slice(0, 8)}
                  </div>
                ))}
                {result.mismatches.length > 10 && (
                  <div className="text-[9px] font-mono text-gray-500 mt-1">
                    ... 还有 {result.mismatches.length - 10} 个差异块
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
