import { useState } from 'react'
import { Play, Pause, Settings, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { useSimulationStore } from '@/store/simulation'
import { cn } from '@/lib/utils'

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-gray-400 font-rajdhani">{label}</span>
        <span className="text-laser-cyan font-orbitron text-glow">
          {value.toLocaleString()}
          {unit && <span className="text-gray-500 ml-1">{unit}</span>}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
      />
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-laser-cyan/10 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 px-4 hover:bg-laser-cyan/5 transition-colors"
      >
        <div className="flex items-center gap-2 text-laser-cyan">
          <Icon size={14} />
          <span className="text-xs font-orbitron uppercase tracking-wider">{title}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>
      <div className={cn('px-4 pb-3 space-y-3', open ? 'animate-fade-in' : 'hidden')}>{children}</div>
    </div>
  )
}

export default function ControlPanel() {
  const config = useSimulationStore((s) => s.config)
  const isPlaying = useSimulationStore((s) => s.isPlaying)

  const setConfig = useSimulationStore((s) => s.setConfig)
  const setPlaying = useSimulationStore((s) => s.setPlaying)
  const setSimulationTime = useSimulationStore((s) => s.setSimulationTime)

  const handleReset = () => {
    setConfig({
      satelliteCount: 30,
      orbitAltitude: 550,
      orbitInclination: 53,
      planeCount: 5,
      timeSpeed: 1,
      linkThreshold: 3000,
    })
    setSimulationTime(0)
    setPlaying(false)
  }

  return (
    <div className="fixed left-0 top-0 h-screen w-72 z-30 glass-panel border-r border-laser-cyan/20 flex flex-col">
      <div className="p-4 border-b border-laser-cyan/10">
        <h2 className="text-laser-cyan font-orbitron text-sm uppercase tracking-widest flex items-center gap-2">
          <Settings size={14} />
          Control Panel
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <Section title="Constellation" icon={Settings}>
          <SliderControl
            label="Satellite Count"
            value={config.satelliteCount}
            min={10}
            max={100}
            step={1}
            onChange={(v) => setConfig({ satelliteCount: v })}
          />
          <SliderControl
            label="Altitude"
            value={config.orbitAltitude}
            min={300}
            max={1500}
            step={10}
            unit="km"
            onChange={(v) => setConfig({ orbitAltitude: v })}
          />
          <SliderControl
            label="Inclination"
            value={config.orbitInclination}
            min={0}
            max={90}
            step={1}
            unit="°"
            onChange={(v) => setConfig({ orbitInclination: v })}
          />
          <SliderControl
            label="Orbital Planes"
            value={config.planeCount}
            min={1}
            max={10}
            step={1}
            onChange={(v) => setConfig({ planeCount: v })}
          />
          <SliderControl
            label="Link Threshold"
            value={config.linkThreshold}
            min={1000}
            max={5000}
            step={100}
            unit="km"
            onChange={(v) => setConfig({ linkThreshold: v })}
          />
        </Section>

        <Section title="Simulation" icon={isPlaying ? Play : Pause}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPlaying(!isPlaying)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded font-rajdhani text-sm font-medium transition-all',
                isPlaying
                  ? 'bg-laser-cyan/20 text-laser-cyan border border-laser-cyan/40 hover:bg-laser-cyan/30'
                  : 'bg-satellite-green/20 text-satellite-green border border-satellite-green/40 hover:bg-satellite-green/30'
              )}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-1 py-2 px-3 rounded bg-star-silver/50 text-gray-300 border border-gray-600/30 hover:bg-star-silver/70 transition-all"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <SliderControl
            label="Time Speed"
            value={config.timeSpeed}
            min={1}
            max={1000}
            step={1}
            unit="x"
            onChange={(v) => setConfig({ timeSpeed: v })}
          />
        </Section>
      </div>

      <div className="p-3 border-t border-laser-cyan/10 text-center">
        <span className="text-xs text-gray-600 font-rajdhani">Walker Constellation</span>
      </div>
    </div>
  )
}