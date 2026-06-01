import { useEffect, useState } from 'react'
import { Satellite, Radio, Activity, AlertTriangle, TrendingUp } from 'lucide-react'
import { useSimulationStore } from '@/store/simulation'
import { cn } from '@/lib/utils'

function AnimatedNumber({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    setDisplay(value)
  }, [value])

  return <span className="font-orbitron text-laser-cyan text-glow">{display.toFixed(decimals)}</span>
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  color: string
}) {
  return (
    <div className="glass-panel-inner rounded-lg p-3 transition-all hover:border-laser-cyan/30">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={12} className={color} />
        <span className="text-xs text-gray-400 font-rajdhani uppercase">{label}</span>
      </div>
      <div className={cn('text-lg font-orbitron', color)}>{value}</div>
    </div>
  )
}

export default function DataPanel() {
  const satellites = useSimulationStore((s) => s.satellites)
  const links = useSimulationStore((s) => s.links)
  const selectedSatelliteId = useSimulationStore((s) => s.selectedSatelliteId)
  const simulationTime = useSimulationStore((s) => s.simulationTime)
  const groundTerminals = useSimulationStore((s) => s.groundTerminals)
  const config = useSimulationStore((s) => s.config)

  const selectedSatellite = satellites.find((s) => s.id === selectedSatelliteId)

  const avgDelay =
    links.length > 0
      ? links.reduce((sum, l) => sum + l.propagationDelay, 0) / links.length
      : 0

  const maxDoppler =
    links.length > 0 ? Math.max(...links.map((l) => Math.abs(l.dopplerShift))) : 0

  const avgCompensation =
    links.length > 0
      ? links.reduce((sum, l) => sum + Math.abs(l.dopplerShift) / 2, 0) / links.length
      : 0

  const selectedLinks = selectedSatellite
    ? links.filter((l) => l.sourceId === selectedSatellite.id || l.targetId === selectedSatellite.id)
    : []

  return (
    <div className="fixed right-0 top-0 h-screen w-80 z-30 glass-panel border-l border-laser-cyan/20 flex flex-col">
      <div className="p-4 border-b border-laser-cyan/10">
        <h2 className="text-laser-cyan font-orbitron text-sm uppercase tracking-widest flex items-center gap-2">
          <Activity size={14} />
          Telemetry Data
        </h2>
        <div className="mt-1 text-xs text-gray-500 font-rajdhani">
          T+ {simulationTime.toFixed(1)}s
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              icon={Satellite}
              label="Satellites"
              value={satellites.length}
              color="text-laser-cyan"
            />
            <StatCard
              icon={Radio}
              label="Active Links"
              value={links.length}
              color="text-orbit-purple"
            />
            <StatCard
              icon={Activity}
              label="Avg Delay"
              value={
                <span className="text-orbit-purple font-orbitron">
                  <AnimatedNumber value={avgDelay} decimals={2} />
                  <span className="text-xs text-gray-500 ml-1">ms</span>
                </span>
              }
              color="text-orbit-purple"
            />
            <StatCard
              icon={AlertTriangle}
              label="Max Doppler"
              value={
                <span className="text-alert-red font-orbitron">
                  <AnimatedNumber value={maxDoppler} decimals={1} />
                  <span className="text-xs text-gray-500 ml-1">kHz</span>
                </span>
              }
              color="text-alert-red"
            />
            <StatCard
              icon={TrendingUp}
              label="Avg Compensation"
              value={
                <span className="text-satellite-green font-orbitron">
                  <AnimatedNumber value={avgCompensation} decimals={1} />
                  <span className="text-xs text-gray-500 ml-1">kHz</span>
                </span>
              }
              color="text-satellite-green"
            />
          </div>

          {selectedSatellite && (
            <div className="glass-panel-inner rounded-lg p-3 animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <Satellite size={14} className="text-satellite-green" />
                <span className="text-xs text-gray-400 font-rajdhani uppercase">Selected Satellite</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400 font-rajdhani">Name</span>
                  <span className="text-satellite-green font-orbitron text-glow">{selectedSatellite.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 font-rajdhani">Plane</span>
                  <span className="text-gray-200 font-orbitron">{selectedSatellite.orbitPlane + 1}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 font-rajdhani">Altitude</span>
                  <span className="text-gray-200 font-orbitron">{config.orbitAltitude.toFixed(0)} km</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 font-rajdhani">Position (X,Y,Z)</span>
                  <span className="text-gray-300 font-orbitron text-xs">
                    {Object.values(selectedSatellite.position).map((p) => p.toFixed(0)).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 font-rajdhani">Connected Links</span>
                  <span className="text-orbit-purple font-orbitron">{selectedLinks.length}</span>
                </div>
              </div>

              {selectedLinks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-laser-cyan/10">
                  <div className="text-xs text-gray-500 font-rajdhani mb-2">Link Details</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                    {selectedLinks.map((link, i) => {
                      const otherId = link.sourceId === selectedSatellite.id ? link.targetId : link.sourceId
                      const otherSat = satellites.find((s) => s.id === otherId)
                      return (
                        <div key={i} className="text-xs flex justify-between text-gray-400">
                          <span>{otherSat?.name}</span>
                          <span className="text-orbit-purple font-orbitron">
                            {link.propagationDelay.toFixed(2)}ms
                          </span>
                          <span
                            className={cn(
                              'font-orbitron',
                              link.dopplerShift > 0 ? 'text-alert-red' : 'text-satellite-green'
                            )}
                          >
                            {link.dopplerShift > 0 ? '+' : ''}
                            {link.dopplerShift.toFixed(1)}kHz
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="glass-panel-inner rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={12} className="text-alert-red" />
              <span className="text-xs text-gray-400 font-rajdhani uppercase">Ground Terminals</span>
            </div>
            <div className="space-y-1">
              {groundTerminals.map((terminal) => (
                <div
                  key={terminal.id}
                  className="text-xs py-1 px-2 rounded flex items-center justify-between bg-laser-cyan/5"
                >
                  <span className="text-gray-300 font-rajdhani">{terminal.name}</span>
                  <span className="text-gray-500 font-mono">
                    {terminal.latitude.toFixed(1)}°, {terminal.longitude.toFixed(1)}°
                  </span>
                  {terminal.connectedSatelliteId && (
                    <span className="w-2 h-2 rounded-full bg-satellite-green animate-pulse-slow" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-laser-cyan/10">
        <div className="flex justify-between text-xs text-gray-500 font-rajdhani">
          <span>Walker Delta Pattern</span>
          <span className="text-gray-400">{groundTerminals.length} Terminals</span>
        </div>
      </div>
    </div>
  )
}