import { useSimulatorStore } from "@/store/simulatorStore"
import { disconnectPath, connectPath, toggleAutoFailover, setIOLoad } from "@/api/simulator"
import { Zap, Power, PowerOff, Gauge } from "lucide-react"
import { useCallback } from "react"

export default function ControlPanel() {
  const status = useSimulatorStore((s) => s.status)

  const handleDisconnect = useCallback(async (id: string) => {
    await disconnectPath(id)
  }, [])

  const handleConnect = useCallback(async (id: string) => {
    await connectPath(id)
  }, [])

  const handleToggleFailover = useCallback(async () => {
    if (!status) return
    await toggleAutoFailover(!status.auto_failover)
  }, [status])

  const handleIOLoad = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    await setIOLoad(parseInt(e.target.value))
  }, [])

  if (!status) return null

  const pathA = status.paths.find((p) => p.id === "pathA")
  const pathB = status.paths.find((p) => p.id === "pathB")

  return (
    <div className="rounded-xl border border-cyber-border bg-cyber-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-cyber-orange" />
        <h2 className="font-mono font-semibold text-sm tracking-wide text-slate-200">
          CONTROL PANEL
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <div className="text-xs font-mono text-cyber-muted uppercase tracking-wider mb-2">
            Path A
          </div>
          {pathA?.connected ? (
            <button
              onClick={() => handleDisconnect("pathA")}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-cyber-red/40 bg-cyber-red/10 text-cyber-red font-mono text-sm font-medium hover:bg-cyber-red/20 transition-colors"
            >
              <PowerOff className="w-4 h-4" />
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => handleConnect("pathA")}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-cyber-green/40 bg-cyber-green/10 text-cyber-green font-mono text-sm font-medium hover:bg-cyber-green/20 transition-colors"
            >
              <Power className="w-4 h-4" />
              Reconnect
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-xs font-mono text-cyber-muted uppercase tracking-wider mb-2">
            Path B
          </div>
          {pathB?.connected ? (
            <button
              onClick={() => handleDisconnect("pathB")}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-cyber-red/40 bg-cyber-red/10 text-cyber-red font-mono text-sm font-medium hover:bg-cyber-red/20 transition-colors"
            >
              <PowerOff className="w-4 h-4" />
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => handleConnect("pathB")}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-cyber-green/40 bg-cyber-green/10 text-cyber-green font-mono text-sm font-medium hover:bg-cyber-green/20 transition-colors"
            >
              <Power className="w-4 h-4" />
              Reconnect
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-xs font-mono text-cyber-muted uppercase tracking-wider mb-2">
            Auto Failover
          </div>
          <button
            onClick={handleToggleFailover}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border font-mono text-sm font-medium transition-colors ${
              status.auto_failover
                ? "border-cyber-orange/40 bg-cyber-orange/10 text-cyber-orange hover:bg-cyber-orange/20"
                : "border-cyber-border bg-cyber-surface text-cyber-muted hover:bg-cyber-surface/80"
            }`}
          >
            <Zap className={`w-4 h-4 ${status.auto_failover ? "animate-pulse" : ""}`} />
            {status.auto_failover ? "Auto ON" : "Auto OFF"}
          </button>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-cyber-border">
        <div className="flex items-center gap-2 mb-2">
          <Gauge className="w-4 h-4 text-cyber-cyan" />
          <span className="text-xs font-mono text-cyber-muted uppercase tracking-wider">
            IO Load
          </span>
          <span className="text-xs font-mono text-cyber-cyan ml-auto">
            {status.io_load_percent}%
          </span>
        </div>
        <input
          type="range"
          min="10"
          max="100"
          value={status.io_load_percent}
          onChange={handleIOLoad}
          className="w-full h-1.5 bg-cyber-border rounded-lg appearance-none cursor-pointer accent-cyber-cyan"
        />
        <div className="flex justify-between text-[10px] font-mono text-cyber-muted mt-1">
          <span>10%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  )
}
