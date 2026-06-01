import { useEffect } from 'react'
import { useLMAStore } from '@/store'
import PBUPanel from '@/components/PBUPanel'
import BindingCacheTable from '@/components/BindingCacheTable'
import EventLogPanel from '@/components/EventLogPanel'
import TopologyDiagram from '@/components/TopologyDiagram'
import { Radio, Activity } from 'lucide-react'

export default function Home() {
  const { refreshAll, entries } = useLMAStore()

  useEffect(() => {
    refreshAll()
    const interval = setInterval(refreshAll, 5000)
    return () => clearInterval(interval)
  }, [refreshAll])

  return (
    <div className="min-h-screen bg-lma-bg">
      <header className="border-b border-lma-border/50 bg-lma-surface/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1440px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-lma-accent/10 border border-lma-accent/30 flex items-center justify-center">
              <Radio size={16} className="text-lma-accent" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lma-text text-base leading-tight">
                PMIPv6 LMA Simulator
              </h1>
              <p className="text-[10px] font-mono text-lma-muted">Local Mobility Anchor · Binding Cache Manager</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Activity size={12} className="text-lma-accent" />
              <span className="text-xs font-mono text-lma-muted">
                {entries.length} active BCE{entries.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-lma-accent animate-pulse-glow" />
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 lg:col-span-3">
            <PBUPanel />
          </div>

          <div className="col-span-12 lg:col-span-9 flex flex-col gap-5">
            <TopologyDiagram />
            <BindingCacheTable />
          </div>

          <div className="col-span-12">
            <EventLogPanel />
          </div>
        </div>
      </main>
    </div>
  )
}
