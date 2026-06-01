import { AlertTriangle, Activity, Tag, Trash2, Play } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { formatDateTime } from '../utils/format.js';
import type { Event } from '../../shared/types.js';

interface EventListProps {
  events: Event[];
  onDelete?: (id: string) => void;
  onPlay?: (event: Event) => void;
}

const eventTypeConfig = {
  motion: { icon: Activity, color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: '移动侦测' },
  alert: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20', label: '告警事件' },
  custom: { icon: Tag, color: 'text-blue-400', bg: 'bg-blue-500/20', label: '自定义' },
};

export function EventList({ events, onDelete, onPlay }: EventListProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <Tag size={48} className="mx-auto mb-4 opacity-30" />
        <p>暂无事件标记</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const config = eventTypeConfig[event.type];
        const Icon = config.icon;

        return (
          <div
            key={event.id}
            className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', config.bg)}>
                <Icon size={20} className={config.color} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-white truncate">{event.title}</h4>
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', config.bg, config.color)}>
                    {config.label}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mb-2">{formatDateTime(event.timestamp)}</p>
                {event.description && (
                  <p className="text-sm text-slate-400">{event.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onPlay && (
                  <button
                    onClick={() => onPlay(event)}
                    className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                  >
                    <Play size={16} />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(event.id)}
                    className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
