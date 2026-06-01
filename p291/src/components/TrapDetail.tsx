import { useTrapStore } from "@/store/trapStore"
import { cn } from "@/lib/utils"
import { VarBind, SnmpTrap } from "@/types"

function VarBindRow({ vb, index }: { vb: VarBind; index: number }) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 border-b border-[#111b28] px-4 py-2.5 text-xs",
        index % 2 === 0 ? "bg-[#0d1320]" : "bg-[#0f1624]"
      )}
    >
      <span className="w-6 shrink-0 text-[#2a3e55]">{index + 1}</span>
      <span className="w-[360px] shrink-0 font-mono text-[#4dd0e1]" title={vb.oid}>
        {vb.oid}
      </span>
      <span className="w-28 shrink-0 text-[#4a5e78]">{vb.value_type}</span>
      <span className="break-all font-mono text-[#c0d0e0]">{vb.value}</span>
    </div>
  )
}

function RawPacketViewer({ rawPdu }: { rawPdu: string }) {
  if (!rawPdu) {
    return (
      <div className="px-4 py-6 text-center text-xs text-[#4a5e78]">
        无原始报文数据
      </div>
    )
  }

  const bytes = []
  for (let i = 0; i < rawPdu.length; i += 2) {
    bytes.push(rawPdu.slice(i, i + 2))
  }

  return (
    <div className="p-4">
      <div className="rounded-lg border border-[#1a2332] bg-[#0a0e17] p-4 font-mono text-[10px] leading-6 text-[#4a5e78]">
        <div className="flex flex-wrap gap-x-1">
          {bytes.map((byte, i) => (
            <span
              key={i}
              className={cn(
                i % 16 < 8 ? "text-[#5a7a9a]" : "text-[#4a6a88]"
              )}
            >
              {byte}
              {(i + 1) % 16 === 0 ? "\n" : " "}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 text-[10px] text-[#2a3e55]">
        共 {bytes.length} 字节
      </div>
    </div>
  )
}

export default function TrapDetail() {
  const selectedTrapId = useTrapStore((s) => s.selectedTrapId)
  const traps = useTrapStore((s) => s.traps)

  const trap: SnmpTrap | undefined = traps.find((t) => t.id === selectedTrapId)

  if (!trap) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-[#2a3e55]">点击列表中的 Trap 查看详情</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="border-b border-[#1a2332] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#00e5a0]">变量绑定 (Variable Bindings)</h3>
        <div className="mt-2 flex gap-4 text-[10px] text-[#4a5e78]">
          <span>源: {trap.source_ip}:{trap.source_port}</span>
          <span>版本: {trap.snmp_version}</span>
          {trap.community && <span>社区: {trap.community}</span>}
        </div>
      </div>

      <div className="shrink-0 border-b border-[#1a2332]">
        <div className="flex items-start gap-4 border-b border-[#111b28] bg-[#0d1320] px-4 py-2 text-[10px] font-bold text-[#2a3e55]">
          <span className="w-6">#</span>
          <span className="w-[360px]">OID</span>
          <span className="w-28">类型</span>
          <span>值</span>
        </div>
        {trap.variable_bindings.map((vb, i) => (
          <VarBindRow key={i} vb={vb} index={i} />
        ))}
      </div>

      <div className="mt-auto border-t border-[#1a2332]">
        <div className="px-4 py-2">
          <h4 className="text-xs font-semibold text-[#4a5e78]">原始报文 (Raw PDU)</h4>
        </div>
        <RawPacketViewer rawPdu={trap.raw_pdu} />
      </div>
    </div>
  )
}
