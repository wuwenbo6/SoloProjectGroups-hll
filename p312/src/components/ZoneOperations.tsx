import { useZNSStore } from '@/store/zns-store'
import { Unlock, Lock, CheckCircle, RotateCcw, HardDrive } from 'lucide-react'

const COMMANDS = [
  {
    name: 'OPEN',
    color: '#00f0b5',
    icon: Unlock,
    enabledStates: ['empty', 'closed'] as string[],
  },
  {
    name: 'CLOSE',
    color: '#f59e0b',
    icon: Lock,
    enabledStates: ['implicitly_opened', 'explicitly_opened'] as string[],
  },
  {
    name: 'FINISH',
    color: '#3b82f6',
    icon: CheckCircle,
    enabledStates: ['implicitly_opened', 'explicitly_opened', 'closed'] as string[],
  },
  {
    name: 'RESET',
    color: '#ef4444',
    icon: RotateCcw,
    enabledStates: ['full', 'closed'] as string[],
  },
]

const STATE_COLORS: Record<string, string> = {
  empty: '#8b949e',
  implicitly_opened: '#00f0b5',
  explicitly_opened: '#00f0b5',
  closed: '#f59e0b',
  full: '#ef4444',
}

export default function ZoneOperations() {
  const selectedZoneId = useZNSStore((s) => s.selectedZoneId)
  const zones = useZNSStore((s) => s.zones)
  const openZone = useZNSStore((s) => s.openZone)
  const closeZone = useZNSStore((s) => s.closeZone)
  const finishZone = useZNSStore((s) => s.finishZone)
  const resetZone = useZNSStore((s) => s.resetZone)
  const loading = useZNSStore((s) => s.loading)

  const zone = zones.find((z) => z.id === selectedZoneId)

  if (!zone) {
    return (
      <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
        <div className="flex items-center gap-2 text-[#8b949e] uppercase text-xs tracking-wider mb-3">
          <HardDrive size={14} />
          <span>Zone Commands</span>
        </div>
        <p className="text-[#8b949e] text-sm">Select a zone to manage</p>
      </div>
    )
  }

  const actions: Record<string, (id: number) => Promise<void>> = {
    OPEN: openZone,
    CLOSE: closeZone,
    FINISH: finishZone,
    RESET: resetZone,
  }

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
      <div className="flex items-center gap-2 text-[#8b949e] uppercase text-xs tracking-wider mb-1">
        <HardDrive size={14} />
        <span>Zone Commands</span>
      </div>
      <div className="text-sm mb-4">
        Zone {zone.id} —{' '}
        <span style={{ color: STATE_COLORS[zone.state] ?? '#8b949e' }}>
          {zone.state}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {COMMANDS.map((cmd) => {
          const enabled = cmd.enabledStates.includes(zone.state)
          const disabled = loading || !enabled
          const Icon = cmd.icon

          return (
            <button
              key={cmd.name}
              disabled={disabled}
              onClick={() => actions[cmd.name](zone.id)}
              className="bg-[#0d1117] border rounded-lg p-4 flex flex-col items-center gap-2 transition-shadow disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:shadow-lg"
              style={{
                borderColor: `${cmd.color}80`,
                ...(enabled && !loading
                  ? { ['--tw-shadow-color' as string]: `${cmd.color}4D` }
                  : {}),
              }}
            >
              <Icon size={20} style={{ color: cmd.color }} />
              <span className="text-sm font-semibold" style={{ color: cmd.color }}>
                {cmd.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
