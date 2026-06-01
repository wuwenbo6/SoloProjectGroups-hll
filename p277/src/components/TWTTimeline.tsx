import React, { useMemo, useRef, useState, useCallback } from 'react';
import { useSimulationStore } from '../store/useSimulationStore';
import { formatTime, getSlotColor, getStatusLabel } from '../utils/format';
import type { Timeslot, STA } from '../../shared/types';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const ROW_HEIGHT = 60;
const TIMELINE_HEIGHT = 40;
const LEFT_PADDING = 140;
const MIN_SLOT_WIDTH = 2;

interface HoveredSlot {
  slot: Timeslot;
  sta: STA;
  x: number;
  y: number;
}

export const TWTTimeline: React.FC = () => {
  const state = useSimulationStore((state) => state.state);
  const selectedSTAId = useSimulationStore((state) => state.selectedSTAId);
  const setSelectedSTAId = useSimulationStore((state) => state.setSelectedSTAId);
  const viewRange = useSimulationStore((state) => state.viewRange);
  const setViewRange = useSimulationStore((state) => state.setViewRange);
  const showSleepSlots = useSimulationStore((state) => state.showSleepSlots);
  const showTransitionSlots = useSimulationStore((state) => state.showTransitionSlots);
  const [hoveredSlot, setHoveredSlot] = useState<HoveredSlot | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, rangeStart: 0 });

  const { stas, timeslots, currentTime, duration } = useMemo(() => {
    if (!state) return { stas: [], timeslots: [], currentTime: 0, duration: 10000 };
    return {
      stas: state.stas,
      timeslots: state.timeslots,
      currentTime: state.currentTime,
      duration: state.duration,
    };
  }, [state]);

  const visibleSlots = useMemo(() => {
    return timeslots.filter((slot) => {
      if (slot.type === 'sleep' && !showSleepSlots) return false;
      if (slot.type === 'transition' && !showTransitionSlots) return false;
      return (
        slot.startTime + slot.duration >= viewRange.start &&
        slot.startTime <= viewRange.end
      );
    });
  }, [timeslots, viewRange, showSleepSlots, showTransitionSlots]);

  const timeToX = useCallback(
    (time: number, width: number) => {
      const range = viewRange.end - viewRange.start;
      return ((time - viewRange.start) / range) * width;
    },
    [viewRange]
  );

  const xToTime = useCallback(
    (x: number, width: number) => {
      const range = viewRange.end - viewRange.start;
      return (x / width) * range + viewRange.start;
    },
    [viewRange]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!timelineRef.current) return;
      e.preventDefault();
      const rect = timelineRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseTime = xToTime(mouseX, rect.width);

      const delta = e.deltaY > 0 ? 1.1 : 0.9;
      const newRange = viewRange.end - viewRange.start;
      const newStart = mouseTime - (mouseTime - viewRange.start) * delta;
      const newEnd = newStart + newRange * delta;

      const clampedStart = Math.max(0, newStart);
      const clampedEnd = Math.min(duration, newEnd);

      if (clampedEnd - clampedStart > 100) {
        setViewRange({ start: clampedStart, end: clampedEnd });
      }
    },
    [viewRange, duration, xToTime, setViewRange]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      setDragStart({
        x: e.clientX,
        rangeStart: viewRange.start,
      });
    },
    [viewRange.start]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStart.x;
      const timeDelta = (deltaX / rect.width) * (viewRange.end - viewRange.start);

      let newStart = dragStart.rangeStart - timeDelta;
      let newEnd = newStart + (viewRange.end - viewRange.start);

      if (newStart < 0) {
        newStart = 0;
        newEnd = viewRange.end - viewRange.start;
      }
      if (newEnd > duration) {
        newEnd = duration;
        newStart = duration - (viewRange.end - viewRange.start);
      }

      setViewRange({ start: newStart, end: newEnd });
    },
    [isDragging, dragStart, viewRange, duration, setViewRange]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const zoomIn = useCallback(() => {
    const range = viewRange.end - viewRange.start;
    const center = (viewRange.start + viewRange.end) / 2;
    const newRange = range * 0.7;
    const newStart = Math.max(0, center - newRange / 2);
    const newEnd = Math.min(duration, center + newRange / 2);
    setViewRange({ start: newStart, end: newEnd });
  }, [viewRange, duration, setViewRange]);

  const zoomOut = useCallback(() => {
    const range = viewRange.end - viewRange.start;
    const center = (viewRange.start + viewRange.end) / 2;
    const newRange = range * 1.3;
    const newStart = Math.max(0, center - newRange / 2);
    const newEnd = Math.min(duration, center + newRange / 2);
    setViewRange({ start: newStart, end: newEnd });
  }, [viewRange, duration, setViewRange]);

  const resetZoom = useCallback(() => {
    setViewRange({ start: 0, end: duration });
  }, [duration, setViewRange]);

  const timeMarkers = useMemo(() => {
    const range = viewRange.end - viewRange.start;
    const targetMarkers = 10;
    const step = Math.pow(10, Math.floor(Math.log10(range / targetMarkers)));
    const markers: number[] = [];
    const start = Math.ceil(viewRange.start / step) * step;
    for (let t = start; t <= viewRange.end; t += step) {
      markers.push(t);
    }
    return markers;
  }, [viewRange]);

  const staRows = useMemo(() => {
    return stas.map((sta, index) => {
      const staSlots = visibleSlots.filter((s) => s.staId === sta.id);
      return { sta, slots: staSlots, rowIndex: index };
    });
  }, [stas, visibleSlots]);

  const handleSlotHover = useCallback(
    (slot: Timeslot, sta: STA, e: React.MouseEvent) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHoveredSlot({
        slot,
        sta,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    []
  );

  const handleSlotLeave = useCallback(() => {
    setHoveredSlot(null);
  }, []);

  const totalHeight = TIMELINE_HEIGHT + stas.length * ROW_HEIGHT;

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h3 className="text-lg font-semibold text-slate-100">TWT 时间线</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={zoomIn}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="放大"
          >
            <ZoomIn className="w-4 h-4 text-slate-300" />
          </button>
          <button
            onClick={zoomOut}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4 text-slate-300" />
          </button>
          <button
            onClick={resetZoom}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="重置"
          >
            <Maximize2 className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>

      <div
        ref={timelineRef}
        className="relative overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ height: totalHeight }}
      >
          <svg
          width="100%"
          height={totalHeight}
          className="select-none"
        >
          <defs>
            <pattern id="grid" width="100%" height="1">
            <line x1="0" y1="0" x2="0" y2="1" stroke="#334155" strokeWidth="1" />
          </pattern>
        </defs>

          <g transform={`translate(${LEFT_PADDING}, 0)`}>
            {timeMarkers.map((time) => {
              const x = timeToX(time, 100);
              return (
                <g key={time}>
                  <line
                    x1={x + '%'}
                    y1={TIMELINE_HEIGHT}
                    x2={x + '%'}
                    y2={totalHeight}
                    stroke="#334155"
                    strokeWidth="1"
                    strokeDasharray="4,4"
                  />
                  <text
                    x={x + '%'}
                    y={25}
                    fill="#94a3b8"
                    fontSize="11"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    {formatTime(time)}
                  </text>
                </g>
              );
            })}

            {currentTime >= viewRange.start && currentTime <= viewRange.end && (
              <g>
                <line
                  x1={`${timeToX(currentTime, 100)}%`}
                  y1={0}
                  x2={`${timeToX(currentTime, 100)}%`}
                  y2={totalHeight}
                  stroke="#06b6d4"
                  strokeWidth="2"
                >
                  <animate
                    attributeName="opacity"
                    values="1;0.5;1"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </line>
              </g>
            )}

            {staRows.map(({ sta, slots, rowIndex }) => {
              const y = TIMELINE_HEIGHT + rowIndex * ROW_HEIGHT;
              const isSelected = selectedSTAId === sta.id;

              return (
                <g key={sta.id}>
                  <rect
                    x={-LEFT_PADDING}
                    y={y}
                    width={LEFT_PADDING}
                    height={ROW_HEIGHT}
                    fill={isSelected ? '#1e3a5f' : '#0f172a'}
                    stroke="#334155"
                    strokeWidth="1"
                  />
                  <circle
                    cx={-LEFT_PADDING + 20}
                    cy={y + ROW_HEIGHT / 2}
                    r={8}
                    fill={sta.color}
                  />
                  <text
                    x={-LEFT_PADDING + 36}
                    y={y + ROW_HEIGHT / 2 + 4}
                    fill="#e2e8f0"
                    fontSize="12"
                    fontWeight="500"
                  >
                    {sta.name}
                  </text>
                  <text
                    x={-LEFT_PADDING + 36}
                    y={y + ROW_HEIGHT / 2 + 20}
                    fill="#64748b"
                    fontSize="10"
                  >
                    {getStatusLabel(sta.status)}
                  </text>

                  <rect
                    x={0}
                    y={y}
                    width="100%"
                    height={ROW_HEIGHT}
                    fill="#0f172a"
                    stroke="#334155"
                    strokeWidth="1"
                  />

                  {slots.map((slot, slotIndex) => {
                    const slotX = timeToX(slot.startTime, 100);
                    const slotWidth = Math.max(
                      MIN_SLOT_WIDTH,
                      timeToX(slot.startTime + slot.duration, 100) - slotX
                    );

                    return (
                      <rect
                        key={slotIndex}
                        x={`${slotX}%`}
                        y={y + 8}
                        width={`${slotWidth}%`}
                        height={ROW_HEIGHT - 16}
                        fill={getSlotColor(slot.type, 0.8)}
                        rx={2}
                        style={{
                          transition: 'all 0.2s ease',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => handleSlotHover(slot, sta, e)}
                        onMouseLeave={handleSlotLeave}
                        onClick={() =>
                          setSelectedSTAId(isSelected ? null : sta.id)
                        }
                      />
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>

        {hoveredSlot && (
          <div
            className="absolute z-10 bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm text-slate-200 shadow-xl"
            style={{
              left: hoveredSlot.x + 16,
              top: hoveredSlot.y + 16,
              pointerEvents: 'none',
            }}
          >
            <div className="font-semibold mb-1" style={{ color: hoveredSlot.sta.color }}>
              {hoveredSlot.sta.name}
            </div>
            <div className="text-slate-400">
              类型: {getStatusLabel(hoveredSlot.slot.type)}
            </div>
            <div className="text-slate-400">
              开始: {formatTime(hoveredSlot.slot.startTime)}
            </div>
            <div className="text-slate-400">
              持续: {formatTime(hoveredSlot.slot.duration)}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between text-sm text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.8)' }} />
            唤醒
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(71, 85, 105, 0.8)' }} />
            睡眠
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(245, 158, 11, 0.8)' }} />
            切换
          </span>
        </div>
        <div>
          视图: {formatTime(viewRange.start)} - {formatTime(viewRange.end)}
        </div>
      </div>
    </div>
  );
};
