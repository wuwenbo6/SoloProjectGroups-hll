import { X, Satellite, Radio, Activity, TrendingUp } from 'lucide-react'
import { useSimulationStore } from '@/store/simulation'
import { cn } from '@/lib/utils'

export default function SatelliteInfo() {
  const selectedSatelliteId = useSimulationStore((s) => s.selectedSatelliteId)
  const satellites = useSimulationStore((s) => s.satellites)
  const links = useSimulationStore((s) => s.links)
  const config = useSimulationStore((s) => s.config)
  const selectSatellite = useSimulationStore((s) => s.selectSatellite)

  const satellite = satellites.find((s) => s.id === selectedSatelliteId)

  if (!satellite) return null

  const satLinks = links.filter((l) => l.sourceId === satellite.id || l.targetId === satellite.id)

  return (
    <div className="fixed left-1/2 top-4 -translate-x-1/2 z-40 w-96 animate-fade-in">
      <div className="glass-panel rounded-xl p-4 border border-satellite-green/30 shadow-lg shadow-satellite-green/10">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-satellite-green/20 border border-satellite-green/40 flex items-center justify-center">
              <Satellite size={20} className="text-satellite-green text-glow" />
            </div>
            <div>
              <h3 className="text-satellite-green font-orbitron text-lg text-glow">{satellite.name}</h3>
              <p className="text-xs text-gray-400 font-rajdhani">Orbital Plane {satellite.orbitPlane + 1}</p>
            </div>
          </div>
          <button
            onClick={() => selectSatellite(null)}
            className="p-1 rounded hover:bg-laser-cyan/10 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="glass-panel-inner rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={12} className="text-laser-cyan" />
              <span className="text-xs text-gray-400 font-rajdhani">Altitude</span>
            </div>
            <div className="text-laser-cyan font-orbitron text-glow">
              {config.orbitAltitude.toFixed(0)} <span className="text-xs text-gray-500">km</span>
            </div>
          </div>
          <div className="glass-panel-inner rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={12} className="text-orbit-purple" />
              <span className="text-xs text-gray-400 font-rajdhani">Inclination</span>
            </div>
            <div className="text-orbit-purple font-orbitron">
              {config.orbitInclination.toFixed(0)} <span className="text-xs text-gray-500">°</span>
            </div>
          </div>
        </div>

        <div className="glass-panel-inner rounded-lg p-3 mb-3">
          <div className="text-xs text-gray-400 font-rajdhani mb-2">Position Coordinates (km)</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <div key={axis}>
                <div className="text-xs text-gray-500 uppercase">{axis}</div>
                <div className="text-gray-300 font-orbitron text-sm">{satellite.position[axis].toFixed(0)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel-inner rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Radio size={12} className="text-orbit-purple" />
              <span className="text-xs text-gray-400 font-rajdhani">Connected Links</span>
            </div>
            <span className="text-orbit-purple font-orbitron">{satLinks.length}</span>
          </div>
          {satLinks.length > 0 ? (
            <div className="space-y-1 max-h-36 overflow-y-auto scrollbar-thin">
              {satLinks.map((link, i) => {
                const otherId = link.sourceId === satellite.id ? link.targetId : link.sourceId
                const otherSat = satellites.find((s) => s.id === otherId)
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-laser-cyan/5"
                  >
                    <span className="text-gray-400 font-rajdhani">{otherSat?.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-orbit-purple font-orbitron">{link.distance.toFixed(0)}km</span>
                      <span className="text-gray-500">{link.propagationDelay.toFixed(2)}ms</span>
                      <span
                        className={cn(
                          'font-orbitron',
                          link.dopplerShift > 0 ? 'text-alert-red' : 'text-satellite-green'
                        )}
                      >
                        {link.dopplerShift > 0 ? '+' : ''}
                        {link.dopplerShift.toFixed(1)}
                      </span>
                      <span className="text-gray-600 font-orbitron" title="Doppler Compensation">
                        ⇄ {(Math.abs(link.dopplerShift) / 2).toFixed(1)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-xs text-gray-600 italic py-2 text-center">No active links</div>
          )}
        </div>
      </div>
    </div>
  )
}