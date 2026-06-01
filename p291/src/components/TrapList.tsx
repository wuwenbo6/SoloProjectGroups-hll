import { useTrapStore } from "@/store/trapStore"
import { cn } from "@/lib/utils"
import { ChevronRight, Radio } from "lucide-react"
import type { SnmpTrap } from "@/types"

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return ts
  }
}

function shortenOid(oid: string): string {
  if (oid.length > 40) {
    return oid.slice(0, 37) + "..."
  }
  return oid
}

export default function TrapList() {
  const traps = useTrapStore((s) => s.traps)
  const selectedTrapId = useTrapStore((s) => s.selectedTrapId)
  const selectTrap = useTrapStore((s) => s.selectTrap)

  const handleSelect = (trap: SnmpTrap) => {
    selectTrap(selectedTrapId === trap.id ? null : trap.id)
  }

  if (traps.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 py-20">
        <div className="rounded-full bg-[#162030] p-6">
          <Radio className="h-10 w-10 text-[#2a3e55]" />
        </div>
        <p className="text-sm text-[#4a5e78]">等待接收 SNMP Trap...</p>
        <p className="text-xs text-[#2a3e55]">Trap 数据将通过 WebSocket 实时推送</p>
      </div>
    )
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-left">
        <thead className="sticky top-0 z-10 bg-[#0d1320]">
          <tr className="border-b border-[#1a2332] text-xs font-medium text-[#4a5e78]">
            <th className="px-4 py-3 w-8" />
            <th className="px-4 py-3">时间戳</th>
            <th className="px-4 py-3">源地址</th>
            <th className="px-4 py-3">Trap OID</th>
            <th className="px-4 py-3">版本</th>
            <th className="px-4 py-3">VarBinds</th>
          </tr>
        </thead>
        <tbody>
          {traps.map((trap) => (
            <tr
              key={trap.id}
              onClick={() => handleSelect(trap)}
              className={cn(
                "cursor-pointer border-b border-[#111b28] transition-all duration-150",
                selectedTrapId === trap.id
                  ? "bg-[#0d2a1f] hover:bg-[#0d2a1f]"
                  : "hover:bg-[#111b28]"
              )}
            >
              <td className="px-4 py-3">
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-[#4a5e78] transition-transform duration-200",
                    selectedTrapId === trap.id && "rotate-90 text-[#00e5a0]"
                  )}
                />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[#8fa3be]">
                {formatTimestamp(trap.timestamp)}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[#c0d0e0]">
                {trap.source_ip}:{trap.source_port}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[#8fa3be]" title={trap.trap_oid}>
                {shortenOid(trap.trap_oid)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    trap.snmp_version === "v3"
                      ? "bg-[#2a1a40] text-[#b388ff]"
                      : trap.snmp_version === "v1"
                        ? "bg-[#2a2a1a] text-[#ffd54f]"
                        : "bg-[#1a2a35] text-[#4dd0e1]"
                  )}
                >
                  {trap.snmp_version}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[#4a5e78]">
                {trap.variable_bindings.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
