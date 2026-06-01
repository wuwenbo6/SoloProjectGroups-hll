import { useState, useMemo } from "react"
import { useTopologyStore } from "@/stores/topology"
import { Search, ChevronLeft, ChevronRight, Server, Network, Monitor } from "lucide-react"

function deviceIcon(name: string) {
  const l = name.toLowerCase()
  if (l.includes("core")) return <Server size={14} />
  if (l.includes("dist")) return <Network size={14} />
  return <Monitor size={14} />
}

export default function DeviceSidebar() {
  const topology = useTopologyStore((s) => s.topology) ?? { devices: [], links: [] }
  const selectedDeviceId = useTopologyStore((s) => s.selectedDeviceId)
  const selectDevice = useTopologyStore((s) => s.selectDevice)
  const sidebarOpen = useTopologyStore((s) => s.sidebarOpen)
  const toggleSidebar = useTopologyStore((s) => s.toggleSidebar)
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    if (!search.trim()) return topology.devices
    const q = search.toLowerCase()
    return topology.devices.filter(
      (d) =>
        d.systemName.toLowerCase().includes(q) ||
        d.chassisId.toLowerCase().includes(q)
    )
  }, [topology.devices, search])

  const onlineCount = topology.devices.filter((d) => d.status === "online").length

  return (
    <div
      className={`absolute left-0 top-0 bottom-8 z-20 flex transition-all duration-300 ${
        sidebarOpen ? "w-72" : "w-10"
      }`}
    >
      <div
        className={`flex-1 flex flex-col overflow-hidden border-r border-[#2a3050] ${
          sidebarOpen ? "bg-[#1a1f3a]/95 backdrop-blur-md" : "bg-transparent border-r-0"
        }`}
      >
        {sidebarOpen && (
          <>
            <div className="p-3 border-b border-[#2a3050]">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8888aa]" />
                <input
                  type="text"
                  placeholder="搜索设备..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-md bg-[#0a0e27] border border-[#2a3050] text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#00d4ff]"
                />
              </div>
              <div className="mt-2 text-xs text-[#8888aa]">
                共 {topology.devices.length} 台设备 / {onlineCount} 在线 / {topology.links.length} 链路
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filtered.map((device) => (
                <button
                  key={device.id}
                  onClick={() => selectDevice(device.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    selectedDeviceId === device.id
                      ? "bg-[#00d4ff]/10 border-l-2 border-[#00d4ff]"
                      : "hover:bg-[#1a2040] border-l-2 border-transparent"
                  }`}
                >
                  <span className="text-[#00d4ff]">{deviceIcon(device.systemName)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{device.systemName}</div>
                    <div className="text-xs text-[#8888aa] truncate font-mono">
                      {device.chassisId}
                    </div>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      device.status === "online" ? "bg-[#4ade80]" : "bg-[#ef4444]"
                    }`}
                  />
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="p-4 text-center text-xs text-[#555]">未找到匹配设备</div>
              )}
            </div>
          </>
        )}
      </div>
      <button
        onClick={toggleSidebar}
        className="self-center w-6 h-12 flex items-center justify-center bg-[#1a1f3a]/90 border border-[#2a3050] rounded-r-md text-[#8888aa] hover:text-[#00d4ff] transition-colors"
      >
        {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
    </div>
  )
}
