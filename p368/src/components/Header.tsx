import { useSimulatorStore } from "@/store/simulatorStore"
import { Wifi, WifiOff, HardDrive } from "lucide-react"

export default function Header() {
  const wsConnected = useSimulatorStore((s) => s.wsConnected)
  const status = useSimulatorStore((s) => s.status)

  return (
    <header className="border-b border-cyber-border bg-cyber-surface/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <HardDrive className="w-7 h-7 text-cyber-cyan" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-cyber-green rounded-full animate-pulse" />
          </div>
          <div>
            <h1 className="font-mono font-bold text-lg text-slate-100 tracking-wide">
              NVMe/TCP Simulator
            </h1>
            <p className="text-[10px] font-mono text-cyber-muted tracking-widest uppercase">
              Dual-Path Failover Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {status && (
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
              <span className="text-cyber-muted">Active:</span>
              <span
                className={
                  status.active_path === "pathA"
                    ? "text-cyber-cyan font-semibold"
                    : "text-blue-400 font-semibold"
                }
              >
                {status.active_path === "pathA" ? "Path A" : "Path B"}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs font-mono">
            {wsConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-cyber-green" />
                <span className="text-cyber-green">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-cyber-red" />
                <span className="text-cyber-red">Offline</span>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
