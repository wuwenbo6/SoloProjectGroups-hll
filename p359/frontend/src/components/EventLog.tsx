import { useEffect, useRef } from 'react';
import { ScrollText, AlertCircle, Info, Activity, Zap, GitBranch } from 'lucide-react';
import { OAMEvent } from '../types';
import { formatTimestamp, getStatusColor, getStatusBgColor } from '../utils/formatters';

interface EventLogProps {
  events: OAMEvent[];
}

const eventIcons: Record<string, any> = {
  info: Info,
  discovery: GitBranch,
  pdu: Activity,
  fault: AlertCircle,
  state_change: Zap,
};

export function EventLog({ events }: EventLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">事件日志</h2>
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-400">{events.length} 条</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-y-auto p-3 space-y-2"
      >
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <ScrollText className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm">暂无事件</span>
          </div>
        ) : (
          events.map((event, index) => {
            const Icon = eventIcons[event.type] || Info;
            const isNew = index === events.length - 1;

            return (
              <div
                key={event.id}
                className={`flex gap-3 p-3 rounded-lg border transition-all duration-300 ${
                  isNew ? 'animate-slide-in' : ''
                } ${getStatusBgColor(event.severity)} border-transparent hover:border-slate-600/50`}
              >
                <div className={`mt-0.5 ${getStatusColor(event.severity)}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${getStatusColor(event.severity)}`}>
                      {event.type.toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  <div className="text-sm text-slate-300 mt-0.5">{event.message}</div>
                  {event.details && Object.keys(event.details).length > 0 && (
                    <div className="mt-1 text-xs text-slate-500 font-mono bg-slate-800/50 rounded p-2">
                      {JSON.stringify(event.details, null, 2)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
