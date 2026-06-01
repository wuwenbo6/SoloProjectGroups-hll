import { useTopologyStore } from "@/stores/topology"
import { Wifi, WifiOff } from "lucide-react"

interface StatusBarProps {
  connected: boolean
}

export default function StatusBar({ connected }: StatusBarProps) {
  const topology = useTopologyStore((s) => s.topology) ?? { devices: [], links: [] }
  const onlineCount = topology.devices.filter((d) => d.status === "online").length

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 h-8 flex items-center px-4 bg-[#1a1f3a]/90 backdrop-blur-md border-t border-[#2a3050] text-xs text-[#8888aa] gap-6">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-[#4ade80]" : "bg-[#ef4444]"}`} />
        {connected ? (
          <Wifi size={12} className="text-[#4ade80]" />
        ) : (
          <WifiOff size={12} className="text-[#ef4444]" />
        )}
        <span>{connected ? "WebSocket 已连接" : "WebSocket 断开"}</span>
      </div>
      <div>
        在线: <span className="text-[#4ade80]">{onlineCount}</span> / {topology.devices.length}
      </div>
      <div>
        链路: <span className="text-[#00d4ff]">{topology.links.length}</span>
      </div>
      <div className="ml-auto font-mono">
        LLDP Network Topology Viewer
      </div>
    </div>
  )
}
