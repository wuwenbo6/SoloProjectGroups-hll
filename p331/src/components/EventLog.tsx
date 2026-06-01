import { useEffect, useRef } from 'react';
import type { SimEvent } from '@/types/simulator';

interface EventLogProps {
  events: SimEvent[];
  maxDisplay?: number;
}

function getEventColor(type: string): string {
  if (type.includes('join')) return 'text-emerald-400';
  if (type.includes('prune')) return 'text-red-400';
  if (type.includes('traffic') || type.includes('forward')) return 'text-cyan-400';
  if (type.includes('state_change') || type.includes('state')) return 'text-yellow-400';
  if (type.includes('register')) return 'text-fuchsia-400';
  return 'text-gray-400';
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) {
    const d2 = new Date(ts);
    if (isNaN(d2.getTime())) return '--:--:--';
    return d2.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  return d.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function EventLog({ events, maxDisplay = 100 }: EventLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const displayEvents = events.slice(-maxDisplay);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayEvents.length]);

  return (
    <div className="h-[200px] bg-gray-950/90 border-t border-gray-700/50 flex flex-col">
      <div className="px-4 py-2 border-b border-gray-800/50 flex items-center">
        <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
          事件日志
        </h2>
        <span className="ml-2 text-xs text-gray-600 font-mono">
          {displayEvents.length} 条
        </span>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto custom-scrollbar px-4 py-2 font-mono text-xs leading-5"
      >
        {displayEvents.length === 0 && (
          <p className="text-gray-600">等待事件...</p>
        )}
        {displayEvents.map((event, idx) => (
          <div key={idx} className="flex gap-2">
            <span className="text-gray-600 shrink-0">
              [{formatTimestamp(event.timestamp)}]
            </span>
            <span className={`${getEventColor(event.type)} shrink-0`}>
              {event.type}
            </span>
            <span className="text-gray-400 truncate">
              {JSON.stringify(event.data)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
