import { useMemo } from "react"
import { useTopologyStore } from "@/stores/topology"
import type { DeviceRole, Capabilities } from "@/types"
import { X, Router, Network, Wifi, Monitor, HelpCircle, EthernetPort } from "lucide-react"

function deviceIconByRole(cap: Capabilities | undefined, size = 16) {
  const role = inferRoleFromCap(cap)
  switch (role) {
    case "router": return <Router size={size} />
    case "switch": return <Network size={size} />
    case "wlan": return <Wifi size={size} />
    case "station": return <Monitor size={size} />
    default: return <HelpCircle size={size} />
  }
}

function inferRoleFromCap(cap: Capabilities | undefined): DeviceRole {
  if (!cap || (!cap.available?.length && !cap.enabled?.length)) return "switch"
  const enabled = cap.enabled || []
  const available = cap.available || []
  if (enabled.includes("Router")) return "router"
  if (enabled.includes("WLAN")) return "wlan"
  if (enabled.includes("Bridge")) return "switch"
  if (enabled.includes("Station")) return "station"
  if (available.includes("Router")) return "router"
  if (available.includes("Bridge")) return "switch"
  return "other"
}

const ROLE_LABELS: Record<DeviceRole, string> = {
  router: "路由器",
  switch: "交换机",
  wlan: "无线AP",
  station: "终端",
  other: "其他",
}

export default function DeviceDetailPanel() {
  const topology = useTopologyStore((s) => s.topology) ?? { devices: [], links: [] }
  const selectedDeviceId = useTopologyStore((s) => s.selectedDeviceId)
  const selectDevice = useTopologyStore((s) => s.selectDevice)

  const device = useMemo(
    () => topology.devices.find((d) => d.id === selectedDeviceId),
    [topology.devices, selectedDeviceId]
  )

  const neighbors = useMemo(() => {
    if (!device) return []
    const neighborIds = new Set<string>()
    for (const link of topology.links) {
      if (link.sourceDeviceId === device.id) neighborIds.add(link.targetDeviceId)
      if (link.targetDeviceId === device.id) neighborIds.add(link.sourceDeviceId)
    }
    return topology.devices.filter((d) => neighborIds.has(d.id))
  }, [device, topology.devices, topology.links])

  if (!device) return null

  return (
    <div className="absolute right-0 top-0 bottom-8 z-20 w-80 bg-[#1a1f3a]/95 backdrop-blur-md border-l border-[#2a3050] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a3050]">
        <div className="flex items-center gap-2 text-[#00d4ff]">
          {deviceIconByRole(device.capabilities)}
          <span className="text-sm font-medium">设备详情</span>
        </div>
        <button
          onClick={() => selectDevice(null)}
          className="p-1 rounded hover:bg-[#2a3050] text-[#8888aa] hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        <div className="space-y-2">
          <InfoRow label="系统名称" value={device.systemName} />
          <InfoRow label="Chassis ID" value={device.chassisId} mono />
          <InfoRow label="Chassis 子类型" value={device.chassisIdSubtype} />
          <InfoRow label="管理地址" value={device.managementAddress || "—"} mono />
          <InfoRow label="TTL" value={String(device.ttl)} />
          <InfoRow label="状态">
            <span className={device.status === "online" ? "text-[#4ade80]" : "text-[#ef4444]"}>
              {device.status === "online" ? "在线" : "离线"}
            </span>
          </InfoRow>
          <InfoRow label="最后发现" value={device.lastSeen ? new Date(device.lastSeen).toLocaleString() : "—"} />
          <InfoRow label="设备角色">
            <span className="text-[#00d4ff] text-xs">
              {ROLE_LABELS[inferRoleFromCap(device.capabilities)] || "未知"}
            </span>
          </InfoRow>
          {(device.capabilities?.available?.length || device.capabilities?.enabled?.length) ? (
            <div className="mt-1">
              <div className="text-[10px] text-[#555] mb-1">可用能力</div>
              <div className="flex flex-wrap gap-1">
                {device.capabilities.available.map((c) => (
                  <span
                    key={c}
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      device.capabilities.enabled.includes(c)
                        ? "bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/40"
                        : "bg-[#2a3050] text-[#666] border border-[#2a3050]"
                    }`}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {device.systemDescription && (
          <div>
            <h3 className="text-xs font-medium text-[#00d4ff] mb-1">系统描述</h3>
            <p className="text-xs text-[#8888aa] break-all bg-[#0a0e27] rounded p-2 font-mono">
              {device.systemDescription}
            </p>
          </div>
        )}
        {device.ports.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-[#00d4ff] mb-2">端口 ({device.ports.length})</h3>
            <div className="space-y-2">
              {device.ports.map((port) => (
                <div key={port.id} className="bg-[#0a0e27] rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <EthernetPort size={12} className="text-[#00d4ff] flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-white truncate">{port.description || port.id}</div>
                        <div className="text-[10px] text-[#555] font-mono truncate">{port.id}</div>
                      </div>
                    </div>
                    {port.speedMbps > 0 && (
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="text-[10px] text-[#8888aa] font-mono">
                          {port.speedMbps >= 1000 ? `${(port.speedMbps / 1000).toFixed(0)}G` : `${port.speedMbps}M`}
                        </div>
                      </div>
                    )}
                  </div>
                  {port.utilization > 0 && port.speedMbps > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="text-[#8888aa]">利用率</span>
                        <span className={`font-mono ${
                          port.utilization > 80 ? "text-[#ef4444]" :
                          port.utilization > 50 ? "text-[#facc15]" :
                          "text-[#4ade80]"
                        }`}>
                          {port.utilization.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#2a3050] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 rounded-full ${
                            port.utilization > 80 ? "bg-[#ef4444]" :
                            port.utilization > 50 ? "bg-[#facc15]" :
                            "bg-[#4ade80]"
                          }`}
                          style={{ width: `${Math.min(100, port.utilization)}%` }}
                        />
                      </div>
                      {(port.inOctets > 0 || port.outOctets > 0) && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-[#555] font-mono">↓ {formatBytes(port.inOctets)}</span>
                          <span className="text-[10px] text-[#555] font-mono">↑ {formatBytes(port.outOctets)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {device.tlvs.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-[#00d4ff] mb-1">TLV ({device.tlvs.length})</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#555]">
                  <th className="text-left py-1">类型</th>
                  <th className="text-left py-1">名称</th>
                  <th className="text-left py-1">值</th>
                </tr>
              </thead>
              <tbody>
                {device.tlvs.map((tlv, i) => (
                  <tr key={i} className="border-t border-[#2a3050]">
                    <td className="py-1 text-[#00d4ff] font-mono">{tlv.type}</td>
                    <td className="py-1 text-[#8888aa]">{tlv.typeName}</td>
                    <td className="py-1 text-white font-mono max-w-[120px] truncate">{tlv.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {neighbors.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-[#00d4ff] mb-1">邻居设备 ({neighbors.length})</h3>
            <div className="space-y-1">
              {neighbors.map((n) => (
                <button
                  key={n.id}
                  onClick={() => selectDevice(n.id)}
                  className="w-full flex items-center gap-2 text-xs bg-[#0a0e27] rounded p-2 hover:bg-[#1a2040] transition-colors text-left"
                >
                  {deviceIconByRole(n.capabilities, 12)}
                  <span className="text-white flex-1 truncate">{n.systemName}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      n.status === "online" ? "bg-[#4ade80]" : "bg-[#ef4444]"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({
  label,
  children,
  mono = false,
  value,
}: {
  label: string
  children?: React.ReactNode
  mono?: boolean
  value?: string
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[#555]">{label}</span>
      {children ?? (
        <span className={`text-white ${mono ? "font-mono" : ""}`}>{value}</span>
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}
