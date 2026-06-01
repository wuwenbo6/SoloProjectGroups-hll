import { useEffect, useCallback } from "react"
import { useTrapStore } from "@/store/trapStore"
import { useWebSocket } from "@/hooks/useWebSocket"
import { fetchTraps, fetchStatus, clearTraps, exportTraps, sendDemoTrap } from "@/utils/api"
import { cn } from "@/lib/utils"
import { Trash2, Download, RefreshCw, Filter, Zap } from "lucide-react"
import TrapList from "@/components/TrapList"
import TrapDetail from "@/components/TrapDetail"
import StatusBar from "@/components/StatusBar"

export default function TrapMonitor() {
  useWebSocket()

  const versionFilter = useTrapStore((s) => s.versionFilter)
  const setVersionFilter = useTrapStore((s) => s.setVersionFilter)
  const setTraps = useTrapStore((s) => s.setTraps)
  const setStatus = useTrapStore((s) => s.setStatus)
  const clearTrapsStore = useTrapStore((s) => s.clearTraps)
  const selectedTrapId = useTrapStore((s) => s.selectedTrapId)

  const loadTraps = useCallback(async () => {
    try {
      const data = await fetchTraps(versionFilter)
      setTraps(data.traps, data.total)
    } catch {
      // backend not available
    }
  }, [versionFilter, setTraps])

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchStatus()
      setStatus(data)
    } catch {
      // backend not available
    }
  }, [setStatus])

  useEffect(() => {
    loadTraps()
    loadStatus()
    const interval = setInterval(loadStatus, 5000)
    return () => clearInterval(interval)
  }, [loadTraps, loadStatus])

  const handleClear = async () => {
    await clearTraps()
    clearTrapsStore()
  }

  const handleDemoTrap = async () => {
    await sendDemoTrap()
  }

  const versionOptions = [
    { value: null, label: "全部" },
    { value: "v2c", label: "v2c" },
    { value: "v3", label: "v3" },
  ]

  return (
    <div className="flex h-full flex-col">
      <StatusBar />

      <div className="flex items-center gap-3 border-b border-[#1a2332] bg-[#0d1320] px-6 py-3">
        <Filter className="h-4 w-4 text-[#4a5e78]" />
        <div className="flex gap-1">
          {versionOptions.map(({ value, label }) => (
            <button
              key={label}
              onClick={() => setVersionFilter(value)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-all duration-200",
                versionFilter === value
                  ? "bg-[#00e5a0]/15 text-[#00e5a0] shadow-[0_0_8px_rgba(0,229,160,0.1)]"
                  : "bg-[#162030] text-[#6b7f99] hover:bg-[#1a2a3d] hover:text-[#8fa3be]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={handleDemoTrap}
            className="flex items-center gap-1.5 rounded-md bg-[#1a2a35] px-3 py-1.5 text-xs text-[#4dd0e1] transition-all hover:bg-[#1a3040] hover:text-[#6de0ed]"
          >
            <Zap className="h-3.5 w-3.5" />
            模拟 Trap
          </button>
          <button
            onClick={loadTraps}
            className="flex items-center gap-1.5 rounded-md bg-[#162030] px-3 py-1.5 text-xs text-[#6b7f99] transition-all hover:bg-[#1a2a3d] hover:text-[#8fa3be]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
          <button
            onClick={exportTraps}
            className="flex items-center gap-1.5 rounded-md bg-[#162030] px-3 py-1.5 text-xs text-[#6b7f99] transition-all hover:bg-[#1a2a3d] hover:text-[#8fa3be]"
          >
            <Download className="h-3.5 w-3.5" />
            导出
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-md bg-[#2a1520] px-3 py-1.5 text-xs text-[#ff4d6a] transition-all hover:bg-[#3a1a28]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <TrapList />
        </div>

        {selectedTrapId && (
          <div className="w-[520px] shrink-0 border-l border-[#1a2332] bg-[#0b1018]">
            <TrapDetail />
          </div>
        )}
      </div>
    </div>
  )
}
