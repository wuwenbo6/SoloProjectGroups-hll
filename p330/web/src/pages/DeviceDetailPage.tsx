import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import type { Device } from "@/types"
import { ArrowLeft, Server, Network, Monitor, EthernetPort } from "lucide-react"

function deviceIcon(name: string, size = 20) {
  const l = name.toLowerCase()
  if (l.includes("core")) return <Server size={size} />
  if (l.includes("dist")) return <Network size={size} />
  return <Monitor size={size} />
}

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [device, setDevice] = useState<Device | null>(null)
  const [neighbors, setNeighbors] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      fetch(`/api/devices/${id}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/devices/${id}/neighbors`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([d, n]) => {
        setDevice(d)
        setNeighbors(n?.devices || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0e27] flex items-center justify-center">
        <div className="text-[#00d4ff] animate-pulse">加载中...</div>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="min-h-screen bg-[#0a0e27] flex items-center justify-center">
        <div className="text-[#ef4444]">设备未找到</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0e27] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-[#00d4ff] hover:underline mb-6 text-sm">
          <ArrowLeft size={16} />
          返回拓扑图
        </Link>
        <div className="flex items-center gap-3 mb-6">
          <span className="text-[#00d4ff]">{deviceIcon(device.systemName, 28)}</span>
          <div>
            <h1 className="text-2xl font-bold">{device.systemName}</h1>
            <p className="text-sm text-[#8888aa] font-mono">{device.chassisId}</p>
          </div>
          <span
            className={`ml-4 px-2 py-0.5 rounded text-xs font-medium ${
              device.status === "online"
                ? "bg-[#4ade80]/20 text-[#4ade80]"
                : "bg-[#ef4444]/20 text-[#ef4444]"
            }`}
          >
            {device.status === "online" ? "在线" : "离线"}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-[#1a1f3a] rounded-lg border border-[#2a3050] p-4">
            <h2 className="text-sm font-medium text-[#00d4ff] mb-3">基本信息</h2>
            <div className="space-y-2 text-sm">
              <InfoRow label="Chassis ID" value={device.chassisId} mono />
              <InfoRow label="Chassis 子类型" value={device.chassisIdSubtype} />
              <InfoRow label="管理地址" value={device.managementAddress || "—"} mono />
              <InfoRow label="TTL" value={String(device.ttl)} />
              <InfoRow label="最后发现" value={device.lastSeen ? new Date(device.lastSeen).toLocaleString() : "—"} />
            </div>
            {device.systemDescription && (
              <div className="mt-3">
                <h3 className="text-xs text-[#555] mb-1">系统描述</h3>
                <p className="text-xs text-[#8888aa] bg-[#0a0e27] rounded p-2 font-mono break-all">
                  {device.systemDescription}
                </p>
              </div>
            )}
          </section>
          <section className="bg-[#1a1f3a] rounded-lg border border-[#2a3050] p-4">
            <h2 className="text-sm font-medium text-[#00d4ff] mb-3">端口 ({device.ports.length})</h2>
            {device.ports.length === 0 ? (
              <p className="text-xs text-[#555]">无端口信息</p>
            ) : (
              <div className="space-y-1">
                {device.ports.map((port) => (
                  <div key={port.id} className="flex items-center gap-2 text-xs bg-[#0a0e27] rounded p-2">
                    <EthernetPort size={12} className="text-[#00d4ff] flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-white truncate">{port.description || port.id}</div>
                      <div className="text-[#555] font-mono truncate">{port.id} · {port.subtype}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {device.tlvs.length > 0 && (
            <section className="bg-[#1a1f3a] rounded-lg border border-[#2a3050] p-4">
              <h2 className="text-sm font-medium text-[#00d4ff] mb-3">TLV ({device.tlvs.length})</h2>
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
                      <td className="py-1 text-white font-mono max-w-[200px] truncate">{tlv.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section className="bg-[#1a1f3a] rounded-lg border border-[#2a3050] p-4">
            <h2 className="text-sm font-medium text-[#00d4ff] mb-3">邻居设备 ({neighbors.length})</h2>
            {neighbors.length === 0 ? (
              <p className="text-xs text-[#555]">无邻居设备</p>
            ) : (
              <div className="space-y-1">
                {neighbors.map((n) => (
                  <Link
                    key={n.id}
                    to={`/device/${n.id}`}
                    className="flex items-center gap-2 text-xs bg-[#0a0e27] rounded p-2 hover:bg-[#1a2040] transition-colors"
                  >
                    {deviceIcon(n.systemName, 12)}
                    <span className="text-white flex-1 truncate">{n.systemName}</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        n.status === "online" ? "bg-[#4ade80]" : "bg-[#ef4444]"
                      }`}
                    />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#555]">{label}</span>
      <span className={`text-white ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  )
}
