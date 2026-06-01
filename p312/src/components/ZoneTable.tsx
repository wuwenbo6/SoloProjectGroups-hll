import { useZNSStore } from '@/store/zns-store'
import type { ZoneState } from '@/types/zns'

const STATE_COLORS: Record<ZoneState, string> = {
  empty: '#6b7280',
  implicitly_opened: '#f59e0b',
  explicitly_opened: '#00f0b5',
  closed: '#3b82f6',
  full: '#ef4444',
}

const STATE_LABELS: Record<ZoneState, string> = {
  empty: 'EMPTY',
  implicitly_opened: 'IMPLICITLY OPENED',
  explicitly_opened: 'EXPLICITLY OPENED',
  closed: 'CLOSED',
  full: 'FULL',
}

export default function ZoneTable() {
  const zones = useZNSStore((s) => s.zones)
  const selectedZoneId = useZNSStore((s) => s.selectedZoneId)
  const setSelectedZoneId = useZNSStore((s) => s.setSelectedZoneId)

  if (zones.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-[#8b949e] text-sm">
        No zones initialized
      </div>
    )
  }

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-[#161b22]">
            <th className="px-4 py-3 text-left text-[#8b949e] text-xs uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-[#8b949e] text-xs uppercase tracking-wider">
              Zone
            </th>
            <th className="px-4 py-3 text-left text-[#8b949e] text-xs uppercase tracking-wider">
              State
            </th>
            <th className="px-4 py-3 text-left text-[#8b949e] text-xs uppercase tracking-wider">
              Write Pointer
            </th>
            <th className="px-4 py-3 text-left text-[#8b949e] text-xs uppercase tracking-wider">
              Capacity
            </th>
          </tr>
        </thead>
        <tbody>
          {zones.map((zone) => {
            const color = STATE_COLORS[zone.state]
            const label = STATE_LABELS[zone.state]
            const isSelected = selectedZoneId === zone.id
            const usagePercent = zone.capacity > 0 ? (zone.writePointer / zone.capacity) * 100 : 0

            return (
              <tr
                key={zone.id}
                onClick={() => setSelectedZoneId(zone.id)}
                className={`
                  border-t border-[#21262d] cursor-pointer transition-colors
                  ${isSelected ? 'bg-[#161b22]' : 'hover:bg-[#161b22]/50'}
                `}
                style={isSelected ? { borderLeft: `3px solid ${color}` } : undefined}
              >
                <td className="px-4 py-3">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 6px ${color}4D`,
                    }}
                  />
                </td>
                <td className="px-4 py-3 font-mono text-sm text-[#c9d1d9]">
                  Zone {zone.id}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                    style={{
                      backgroundColor: `${color}33`,
                      color,
                    }}
                  >
                    {label}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-sm text-[#c9d1d9]">
                  WP: {zone.writePointer} / {zone.capacity}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-[#21262d] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${usagePercent}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="text-xs text-[#8b949e] w-10 text-right">
                      {Math.round(usagePercent)}%
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
