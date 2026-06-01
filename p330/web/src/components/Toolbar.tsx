import { useState, useCallback } from "react"
import { useTopologyStore } from "@/stores/topology"
import { RefreshCw, LayoutGrid, Maximize, PanelLeft, Download } from "lucide-react"

export default function Toolbar() {
  const topology = useTopologyStore((s) => s.topology) ?? { devices: [], links: [] }
  const sidebarOpen = useTopologyStore((s) => s.sidebarOpen)
  const toggleSidebar = useTopologyStore((s) => s.toggleSidebar)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/topology")
      if (res.ok) {
        const data = await res.json()
        useTopologyStore.getState().setTopology(data)
      }
    } catch {
      // ignore
    } finally {
      setTimeout(() => setRefreshing(false), 600)
    }
  }, [])

  const handleAutoLayout = useCallback(() => {
    window.dispatchEvent(new CustomEvent("topology:auto-layout"))
  }, [])

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const res = await fetch("/api/topology/export")
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        const header = res.headers.get("Content-Disposition")
        const match = header?.match(/filename="(.+?)"/)
        a.download = match?.[1] || `topology-export-${Date.now()}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("Export failed:", err)
    } finally {
      setExporting(false)
    }
  }, [])

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a1f3a]/90 backdrop-blur-md border border-[#2a3050]">
      <button
        onClick={toggleSidebar}
        className="p-1.5 rounded hover:bg-[#2a3050] text-[#8888aa] hover:text-[#00d4ff] transition-colors"
        title="切换侧边栏"
      >
        <PanelLeft size={16} />
      </button>
      <div className="w-px h-5 bg-[#2a3050]" />
      <button
        onClick={handleRefresh}
        className={`p-1.5 rounded hover:bg-[#2a3050] text-[#8888aa] hover:text-[#00d4ff] transition-colors ${
          refreshing ? "animate-spin" : ""
        }`}
        title="刷新拓扑"
      >
        <RefreshCw size={16} />
      </button>
      <button
        onClick={handleAutoLayout}
        className="p-1.5 rounded hover:bg-[#2a3050] text-[#8888aa] hover:text-[#00d4ff] transition-colors"
        title="自动布局"
      >
        <LayoutGrid size={16} />
      </button>
      <button
        onClick={handleFullscreen}
        className="p-1.5 rounded hover:bg-[#2a3050] text-[#8888aa] hover:text-[#00d4ff] transition-colors"
        title="全屏"
      >
        <Maximize size={16} />
      </button>
      <button
        onClick={handleExport}
        className={`p-1.5 rounded hover:bg-[#2a3050] text-[#8888aa] hover:text-[#00d4ff] transition-colors ${
          exporting ? "opacity-50" : ""
        }`}
        title="导出JSON"
        disabled={exporting}
      >
        <Download size={16} />
      </button>
      <div className="w-px h-5 bg-[#2a3050]" />
      <div className="text-xs text-[#8888aa]">
        {topology.devices.length} 设备 / {topology.links.length} 链路
      </div>
    </div>
  )
}
