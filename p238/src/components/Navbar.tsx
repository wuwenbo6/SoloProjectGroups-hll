import { Wifi, WifiOff, Radio, RadioIcon } from 'lucide-react'
import { useSensorStore } from '@/store/sensorStore'

export default function Navbar() {
  const connectionStatus = useSensorStore((s) => s.connectionStatus)
  const paused = useSensorStore((s) => s.paused)

  const coapOnline = connectionStatus.coapServer === 'online'
  const observerActive = connectionStatus.observer === 'active'

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600/20 ring-1 ring-teal-500/30">
              <Radio className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
                CoAP Monitor
              </h1>
              <p className="text-[11px] leading-none text-zinc-500">
                IoT Resource Observer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                coapOnline
                  ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 ring-red-500/20'
              }`}>
                {coapOnline ? (
                  <Wifi className="h-3.5 w-3.5" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5" />
                )}
                CoAP {coapOnline ? 'Online' : 'Offline'}
              </div>

              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                observerActive
                  ? 'bg-amber-500/10 text-amber-400 ring-amber-500/20'
                  : 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20'
              }`}>
                <RadioIcon className="h-3.5 w-3.5" />
                Observe {observerActive ? 'Active' : 'Idle'}
              </div>
            </div>

            {paused && (
              <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 ring-1 ring-red-500/20">
                PAUSED
              </span>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
