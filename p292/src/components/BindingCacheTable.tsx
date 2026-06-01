import { useLMAStore } from '@/store'
import { RefreshCw, Download } from 'lucide-react'
import { ACCESS_TECH_PRIORITY, QOS_CLASS_INFO } from '@/types'
import type { BCEEntry, AccessTechType } from '@/types'

function getStatus(entry: BCEEntry): { label: string; color: string } {
  const now = Date.now()
  const expires = new Date(entry.expires_at).getTime()
  if (now > expires) return { label: 'Expired', color: 'bg-lma-red/20 text-lma-red' }
  const remaining = (expires - now) / 1000
  if (remaining < 300) return { label: 'Expiring', color: 'bg-lma-yellow/20 text-lma-yellow' }
  return { label: 'Active', color: 'bg-lma-accent/20 text-lma-accent' }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false })
}

function formatRemaining(expiresAt: string): string {
  const remaining = (new Date(expiresAt).getTime() - Date.now()) / 1000
  if (remaining <= 0) return '0s'
  const h = Math.floor(remaining / 3600)
  const m = Math.floor((remaining % 3600) / 60)
  const s = Math.floor(remaining % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function getTechBadge(tech: AccessTechType, priority: number) {
  const info = ACCESS_TECH_PRIORITY[tech] || { label: tech, color: 'bg-lma-muted/20 text-lma-muted' }
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${info.color}`}>
      {info.label}
    </span>
  )
}

function getPriorityBar(priority: number) {
  const bars = Array.from({ length: 4 }, (_, i) => (
    <div
      key={i}
      className={`w-1.5 h-3 rounded-sm ${i < priority ? 'bg-lma-accent' : 'bg-lma-border/50'}`}
    />
  ))
  return (
    <div className="flex items-center gap-0.5">
      {bars}
      <span className="text-[10px] font-mono text-lma-muted ml-1">P{priority}</span>
    </div>
  )
}

function getQoSBadge(entry: BCEEntry) {
  if (!entry.qos_profile) return null
  const flows = entry.qos_profile.flow_mappings
  const granted = entry.qos_profile.granted
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {flows.slice(0, 3).map((f, i) => {
          const info = QOS_CLASS_INFO[f.traffic_class]
          return (
            <span
              key={i}
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold ${info.color}`}
              title={`${info.description} - ${f.max_bandwidth_kbps} kbps`}
            >
              {info.label}
            </span>
          )
        })}
        {flows.length > 3 && (
          <span className="text-[9px] font-mono text-lma-muted">+{flows.length - 3}</span>
        )}
      </div>
      {!granted && (
        <span className="text-[9px] font-mono text-lma-yellow">⚠</span>
      )}
    </div>
  )
}

export default function BindingCacheTable() {
  const { entries, refreshBCE, exportHistory } = useLMAStore()

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-display font-bold text-lg text-lma-text">Binding Cache</h2>
          <span className="text-xs font-mono text-lma-muted bg-lma-bg px-2 py-0.5 rounded">
            {entries.length} entries
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-mono bg-lma-bg border border-lma-border text-lma-muted hover:border-lma-accent hover:text-lma-accent transition-all"
              onClick={() => exportHistory('json')}
              title="Export as JSON"
            >
              <Download size={12} />
              JSON
            </button>
            <button
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-mono bg-lma-bg border border-lma-border text-lma-muted hover:border-lma-accent hover:text-lma-accent transition-all"
              onClick={() => exportHistory('csv')}
              title="Export as CSV"
            >
              <Download size={12} />
              CSV
            </button>
          </div>
          <button
            className="p-2 rounded-lg hover:bg-lma-bg border border-transparent hover:border-lma-border text-lma-muted hover:text-lma-accent transition-all"
            onClick={refreshBCE}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12 text-lma-muted">
          <div className="font-mono text-sm">No binding cache entries</div>
          <div className="text-xs mt-1">Send a PBU to register a mobile node</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lma-border">
                <th className="text-left py-2 px-3 text-lma-muted font-mono text-xs font-medium">MN ID</th>
                <th className="text-left py-2 px-3 text-lma-muted font-mono text-xs font-medium">IPv6 Prefix</th>
                <th className="text-left py-2 px-3 text-lma-muted font-mono text-xs font-medium">MAG Address</th>
                <th className="text-left py-2 px-3 text-lma-muted font-mono text-xs font-medium">Access Tech</th>
                <th className="text-left py-2 px-3 text-lma-muted font-mono text-xs font-medium">QoS</th>
                <th className="text-left py-2 px-3 text-lma-muted font-mono text-xs font-medium">Tunnel Pri</th>
                <th className="text-left py-2 px-3 text-lma-muted font-mono text-xs font-medium">Status</th>
                <th className="text-left py-2 px-3 text-lma-muted font-mono text-xs font-medium">Remaining</th>
                <th className="text-left py-2 px-3 text-lma-muted font-mono text-xs font-medium">Registered</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const status = getStatus(entry)
                return (
                  <tr
                    key={entry.mn_id}
                    className="border-b border-lma-border/50 hover:bg-lma-accent/[0.02] transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono text-lma-accent font-medium">{entry.mn_id}</td>
                    <td className="py-2.5 px-3 font-mono text-lma-text">{entry.mn_prefix}</td>
                    <td className="py-2.5 px-3 font-mono text-lma-blue">{entry.mag_address}</td>
                    <td className="py-2.5 px-3">{getTechBadge(entry.access_tech_type, entry.tunnel_priority)}</td>
                    <td className="py-2.5 px-3">{getQoSBadge(entry)}</td>
                    <td className="py-2.5 px-3">{getPriorityBar(entry.tunnel_priority)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-lma-muted text-xs">{formatRemaining(entry.expires_at)}</td>
                    <td className="py-2.5 px-3 font-mono text-lma-muted text-xs">{formatTime(entry.registered_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
