import { useWebSocket } from '@/hooks/useWebSocket'
import { useSensorStore } from '@/store/sensorStore'
import Navbar from '@/components/Navbar'
import ResourceCard from '@/components/ResourceCard'
import RealtimeChart from '@/components/RealtimeChart'
import StatsBar from '@/components/StatsBar'

export default function Home() {
  useWebSocket()
  const resourceList = useSensorStore((s) => s.resourceList)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <span className="h-1 w-4 rounded-full bg-teal-500" />
              CoAP Resources
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {resourceList.map((r) => (
                <ResourceCard key={r.uri} uri={r.uri} />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <span className="h-1 w-4 rounded-full bg-amber-500" />
              Live Data Stream
            </h2>
            <RealtimeChart />
          </div>
        </div>

        <div className="mt-6">
          <StatsBar />
        </div>

        <footer className="mt-8 border-t border-zinc-800 pt-4 pb-8">
          <div className="flex items-center justify-between text-[11px] text-zinc-600">
            <p>CoAP Resource Monitor — IoT Protocol Visualization</p>
            <p>Node.js + node-coap | React + Recharts | WebSocket Bridge</p>
          </div>
        </footer>
      </main>
    </div>
  )
}
