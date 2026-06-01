import { useWebSocket } from "@/hooks/useWebSocket"
import { useSimulatorStore } from "@/store/simulatorStore"
import Header from "@/components/Header"
import PathCard from "@/components/PathCard"
import SwitchCounter from "@/components/SwitchCounter"
import RetryQueue from "@/components/RetryQueue"
import LoadBalancer from "@/components/LoadBalancer"
import LatencyStats from "@/components/LatencyStats"
import IOChart from "@/components/IOChart"
import EventLog from "@/components/EventLog"
import ControlPanel from "@/components/ControlPanel"

export default function Home() {
  useWebSocket()
  const status = useSimulatorStore((s) => s.status)

  if (!status) {
    return (
      <div className="min-h-screen bg-cyber-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-cyber-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-mono text-cyber-muted text-sm">
            Connecting to simulator...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cyber-bg">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {status.paths.map((path) => (
                <PathCard key={path.id} path={path} />
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SwitchCounter />
              <RetryQueue />
              <LoadBalancer />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <IOChart />
              <LatencyStats />
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <EventLog />
          </div>
        </div>

        <ControlPanel />
      </main>

      <footer className="border-t border-cyber-border mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <p className="text-[10px] font-mono text-cyber-muted">
            NVMe/TCP Dual-Path Target Simulator v3.0
          </p>
          <p className="text-[10px] font-mono text-cyber-muted">
            Load balancer + Latency stats
          </p>
        </div>
      </footer>
    </div>
  )
}
