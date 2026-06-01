import { Layers, Circle, Unlock, UnlockKeyhole, Lock, LockKeyhole } from 'lucide-react'
import { useZNSStore } from '@/store/zns-store'

const cards = [
  { label: 'Total Zones', key: 'totalZones' as const, icon: Layers, color: '#00f0b5' },
  { label: 'Empty', key: 'emptyCount' as const, icon: Circle, color: '#6b7280' },
  { label: 'Implicitly Opened', key: 'implicitlyOpenedCount' as const, icon: Unlock, color: '#f59e0b' },
  { label: 'Explicitly Opened', key: 'explicitlyOpenedCount' as const, icon: UnlockKeyhole, color: '#00f0b5' },
  { label: 'Closed', key: 'closedCount' as const, icon: Lock, color: '#3b82f6' },
  { label: 'Full', key: 'fullCount' as const, icon: LockKeyhole, color: '#ef4444' },
]

export default function ZoneStatusOverview() {
  const status = useZNSStore((s) => s.status)

  if (!status) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        Initialize namespace first
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map(({ label, key, icon: Icon, color }) => (
        <div
          key={key}
          className="flex flex-col gap-2 rounded-lg border border-[#30363d] bg-[#0d1117] p-4"
        >
          <div className="flex items-center gap-2">
            <Icon size={18} style={{ color }} />
            <span className="text-3xl font-mono" style={{ color }}>
              {status[key]}
            </span>
          </div>
          <span className="text-xs uppercase tracking-wider text-gray-400">
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
