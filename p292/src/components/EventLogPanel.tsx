import { useLMAStore } from '@/store'
import type { EventLog as EventLogType } from '@/types'

function getEventTypeStyle(type: string): string {
  switch (type) {
    case 'register':
      return 'text-lma-accent'
    case 'update':
      return 'text-lma-blue'
    case 'handover':
      return 'text-lma-yellow'
    case 'tunnel_buffer':
      return 'text-violet-400'
    case 'qos_negotiate':
      return 'text-emerald-400'
    case 'deregister':
      return 'text-lma-red'
    case 'deregister_failed':
      return 'text-lma-yellow'
    default:
      return 'text-lma-muted'
  }
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function EventLogPanel() {
  const { events } = useLMAStore()

  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display font-bold text-lg text-lma-text">Event Log</h2>
        <span className="text-xs font-mono text-lma-muted bg-lma-bg px-2 py-0.5 rounded">
          {events.length} events
        </span>
      </div>

      <div className="bg-lma-bg rounded-lg border border-lma-border/50 p-3 max-h-[280px] overflow-y-auto font-mono text-xs space-y-1.5">
        {events.length === 0 ? (
          <div className="text-lma-muted text-center py-4">No events recorded</div>
        ) : (
          [...events].reverse().map((evt, i) => (
            <EventLine key={i} evt={evt} />
          ))
        )}
      </div>
    </div>
  )
}

function EventLine({ evt }: { evt: EventLogType }) {
  return (
    <div className="flex gap-2 items-start animate-slide-up">
      <span className="text-lma-muted shrink-0">{formatTimestamp(evt.timestamp)}</span>
      <span className={`shrink-0 font-semibold uppercase ${getEventTypeStyle(evt.event_type)}`}>
        [{evt.event_type}]
      </span>
      <span className="text-lma-text">
        {evt.mn_id}
        {evt.mag_address && (
          <span className="text-lma-muted"> @ {evt.mag_address}</span>
        )}
      </span>
      <span className="text-lma-muted truncate">{evt.detail}</span>
    </div>
  )
}
