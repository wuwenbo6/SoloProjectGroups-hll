import Scene from '@/components/Scene'
import ControlPanel from '@/components/ControlPanel'
import DataPanel from '@/components/DataPanel'
import SatelliteInfo from '@/components/SatelliteInfo'
import RoutingPanel from '@/components/RoutingPanel'

export default function Home() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-space-blue">
      <Scene />

      <div className="fixed top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="flex justify-center py-4">
          <div className="glass-panel rounded-xl px-8 py-3 pointer-events-auto">
            <h1 className="text-laser-cyan font-orbitron text-xl font-bold tracking-widest text-glow animate-glow">
              LEO SATELLITE CONSTELLATION SIMULATOR
            </h1>
          </div>
        </div>
      </div>

      <ControlPanel />
      <DataPanel />
      <SatelliteInfo />
      <RoutingPanel />
    </div>
  )
}