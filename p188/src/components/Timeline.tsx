import { useRef, useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { formatDateTime, formatTime } from '../utils/format.js';
import type { Recording, Event } from '../../shared/types.js';

interface TimelineProps {
  recordings: Recording[];
  events: Event[];
  currentTime: number;
  startTime: number;
  endTime: number;
  zoomLevel: number;
  onTimeChange: (time: number) => void;
  onZoomChange: (level: number) => void;
  onEventClick?: (event: Event) => void;
}

export function Timeline({
  recordings,
  events,
  currentTime,
  startTime,
  endTime,
  zoomLevel,
  onTimeChange,
  onZoomChange,
  onEventClick,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const totalDuration = endTime - startTime;

  const getPositionFromTime = useCallback((time: number) => {
    return ((time - startTime) / totalDuration) * 100 * zoomLevel;
  }, [startTime, totalDuration, zoomLevel]);

  const getTimeFromPosition = useCallback((clientX: number) => {
    if (!containerRef.current) return currentTime;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    const time = startTime + (percentage / (100 * zoomLevel)) * totalDuration;
    return Math.max(startTime, Math.min(endTime, time));
  }, [startTime, endTime, totalDuration, zoomLevel, currentTime]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    onTimeChange(getTimeFromPosition(e.clientX));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    onTimeChange(getTimeFromPosition(e.clientX));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const currentPosition = getPositionFromTime(currentTime);

  return (
    <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-slate-400">
          时间轴 - {formatDateTime(startTime)} ~ {formatDateTime(endTime)}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onZoomChange(Math.max(0.5, zoomLevel - 0.5))}
            className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-slate-500 w-16 text-center">{zoomLevel}x</span>
          <button
            onClick={() => onZoomChange(Math.min(5, zoomLevel + 0.5))}
            className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative h-24 bg-slate-950 rounded-lg overflow-x-hidden cursor-pointer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div 
          className="absolute inset-0 transition-transform"
          style={{ transform: `scaleX(${zoomLevel})`, transformOrigin: 'left' }}
        >
          {recordings.map((recording) => {
            const left = getPositionFromTime(recording.startTime);
            const width = (recording.duration / totalDuration) * 100;
            
            return (
              <div
                key={recording.id}
                className="absolute top-2 bottom-2 bg-cyan-600/30 border border-cyan-500/50 rounded"
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <div className="absolute inset-0 bg-cyan-500/10 animate-pulse" />
              </div>
            );
          })}

          {events.map((event) => {
            const left = getPositionFromTime(event.timestamp);
            const eventColor = {
              motion: 'bg-yellow-500',
              alert: 'bg-red-500',
              custom: 'bg-blue-500',
            }[event.type];

            return (
              <div
                key={event.id}
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full cursor-pointer transform -translate-x-1/2 hover:scale-150 transition-transform z-10',
                  eventColor
                )}
                style={{ left: `${left}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick?.(event);
                }}
                title={`${event.title} - ${formatDateTime(event.timestamp)}`}
              />
            );
          })}
        </div>

        <div
          className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-20 pointer-events-none"
          style={{ left: `${currentPosition / zoomLevel}%` }}
        >
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-cyan-400 text-slate-900 text-xs px-2 py-0.5 rounded font-mono whitespace-nowrap">
            {formatTime(currentTime - startTime)}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-6 flex items-end px-2">
          {Array.from({ length: Math.ceil(totalDuration / 60000) + 1 }).map((_, i) => {
            const time = startTime + i * 60000;
            const left = getPositionFromTime(time);
            return (
              <div
                key={i}
                className="absolute bottom-1 text-xs text-slate-600 font-mono"
                style={{ left: `${Math.min(95, left / zoomLevel)}%` }}
              >
                {new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-cyan-500/50 rounded" />
          <span>录像片段</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-500 rounded-full" />
          <span>移动侦测</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full" />
          <span>告警事件</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full" />
          <span>自定义标记</span>
        </div>
      </div>
    </div>
  );
}
