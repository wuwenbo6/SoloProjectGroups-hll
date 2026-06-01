import { Activity, Clock } from 'lucide-react';
import { EventCard } from './EventCard.js';
import type { ChangeEvent } from '../../shared/types.js';

interface ChangeStreamsListenerProps {
  events: ChangeEvent[];
  isConnected: boolean;
}

export function ChangeStreamsListener({ events, isConnected }: ChangeStreamsListenerProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-400" />
          <h3 className="font-semibold text-zinc-100">变更流监听器</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-mono">{events.length} 个事件</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600">
            <Activity className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">暂无变更事件</p>
            <p className="text-xs mt-1">
              {isConnected
                ? '执行 Insert/Update/Delete 操作查看效果'
                : '请先建立连接'}
            </p>
          </div>
        ) : (
          events.map((event, index) => (
            <EventCard
              key={`${event._id._data}-${index}`}
              event={event}
              isNew={index === 0}
            />
          ))
        )}
      </div>
    </div>
  );
}
