import { useMemo } from "react"
import { HardDrive, ArrowDownToLine, AlertTriangle, Trash2, Repeat } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { useAnalysisStore } from "@/store/useAnalysisStore"
import StatsCard from "@/components/StatsCard"
import FileUpload from "@/components/FileUpload"
import { formatSize, formatNumber } from "@/lib/utils"

export default function Dashboard() {
  const { overview, trend, taskId } = useAnalysisStore()

  const spaceBlocks = useMemo(() => {
    if (!overview || overview.total_allocated === 0) return []
    const total = overview.total_allocated
    const leakedPct = overview.leaked_size / total
    const freedPct = overview.total_freed / total
    const allocPct = 1 - leakedPct - freedPct
    const totalBlocks = 120
    const leaked = Math.max(1, Math.round(leakedPct * totalBlocks))
    const freed = Math.max(0, Math.round(freedPct * totalBlocks))
    const alloc = totalBlocks - leaked - freed
    const blocks: { type: string; color: string }[] = []
    for (let i = 0; i < alloc; i++) blocks.push({ type: "allocated", color: "bg-cyan/60" })
    for (let i = 0; i < freed; i++) blocks.push({ type: "freed", color: "bg-amber/40" })
    for (let i = 0; i < leaked; i++) blocks.push({ type: "leaked", color: "bg-red-400/60" })
    return blocks
  }, [overview])

  if (!taskId) {
    return (
      <div className="flex items-center justify-center h-full">
        <FileUpload />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title="Total Allocated"
          value={overview ? formatSize(overview.total_allocated) : "—"}
          subtitle={overview ? `${formatNumber(overview.allocation_count)} ops` : undefined}
          icon={HardDrive}
          color="cyan"
        />
        <StatsCard
          title="Total Freed"
          value={overview ? formatSize(overview.total_freed) : "—"}
          subtitle={overview ? `${formatNumber(overview.deallocation_count)} ops` : undefined}
          icon={ArrowDownToLine}
          color="amber"
        />
        <StatsCard
          title="Leaked Size"
          value={overview ? formatSize(overview.leaked_size) : "—"}
          subtitle={overview ? `${formatNumber(overview.leaked_blocks)} blocks` : undefined}
          icon={AlertTriangle}
          color="red"
        />
        <StatsCard
          title="Leak Count"
          value={overview ? formatNumber(overview.leaked_blocks) : "—"}
          subtitle={overview ? `${formatNumber(overview.total_operations)} total ops` : undefined}
          icon={Trash2}
          color="green"
        />
        <StatsCard
          title="Ref Count"
          value={overview ? formatNumber(overview.ref_count_increments) : "—"}
          subtitle="shared allocations"
          icon={Repeat}
          color="cyan"
        />
      </div>

      <div className="bg-navy-dark border border-navy-light/60 rounded-lg p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Leak Trend</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis dataKey="seq" tick={{ fill: "#94A3B8", fontSize: 11 }} stroke="#1E293B" />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} stroke="#1E293B" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0B1120",
                  border: "1px solid #1E293B",
                  borderRadius: 8,
                  color: "#E2E8F0",
                  fontSize: 12,
                }}
              />
              <Area type="monotone" dataKey="allocated" stroke="#06B6D4" fill="#06B6D4" fillOpacity={0.15} name="Allocated" />
              <Area type="monotone" dataKey="freed" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.15} name="Freed" />
              <Area type="monotone" dataKey="leaked" stroke="#EF4444" fill="#EF4444" fillOpacity={0.15} name="Leaked" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-navy-dark border border-navy-light/60 rounded-lg p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-4">Space Distribution</h3>
        <div className="grid grid-cols-12 sm:grid-cols-15 md:grid-cols-20 gap-1">
          {spaceBlocks.map((b, i) => (
            <div
              key={i}
              className={`aspect-square rounded-sm ${b.color} transition-colors hover:opacity-80`}
              title={b.type}
            />
          ))}
        </div>
        <div className="flex gap-6 mt-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-cyan/60" />
            <span className="text-xs text-slate-400">Allocated</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-amber/40" />
            <span className="text-xs text-slate-400">Freed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-red-400/60" />
            <span className="text-xs text-slate-400">Leaked</span>
          </div>
        </div>
      </div>
    </div>
  )
}
