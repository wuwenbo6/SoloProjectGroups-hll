import { useEffect } from "react"
import { useTopologyStore } from "@/stores/topology"
import { useWebSocket } from "@/hooks/useWebSocket"
import TopologyCanvas from "@/components/TopologyCanvas"
import DeviceSidebar from "@/components/DeviceSidebar"
import Toolbar from "@/components/Toolbar"
import StatusBar from "@/components/StatusBar"
import DeviceDetailPanel from "@/components/DeviceDetailPanel"

export default function TopologyPage() {
  const { connected } = useWebSocket()
  const topology = useTopologyStore((s) => s.topology)
  const setTopology = useTopologyStore((s) => s.setTopology)
  const selectedDeviceId = useTopologyStore((s) => s.selectedDeviceId)

  useEffect(() => {
    if (!topology || topology.devices.length === 0) {
      fetch("/api/topology")
        .then((res) => res.ok ? res.json() : null)
        .then((data) => { if (data) setTopology(data) })
        .catch(() => {})
    }
  }, [])

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0e27]">
      <TopologyCanvas />
      <Toolbar />
      <DeviceSidebar />
      {selectedDeviceId && <DeviceDetailPanel />}
      <StatusBar connected={connected} />
    </div>
  )
}
