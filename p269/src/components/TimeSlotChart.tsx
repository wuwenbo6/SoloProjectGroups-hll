import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useDmrStore } from '@/store/useDmrStore';
import { CALL_TYPE_COLORS, CALL_TYPE_LABELS } from '@/types';
import { formatTime, formatDuration } from '@/utils/format';
import type { TimeSlotOccupancy, CallType, DmrSlot } from '@/types';

interface HoveredSlot {
  slot: TimeSlotOccupancy;
  x: number;
  y: number;
}

export const TimeSlotChart: React.FC = () => {
  const { result, selectedCallType, selectedSlot } = useDmrStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredSlot, setHoveredSlot] = useState<HoveredSlot | null>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const filteredSlots = useMemo(() => {
    if (!result) return [];
    return result.timeSlots.filter((slot) => {
      if (selectedCallType !== 'all' && slot.callType !== selectedCallType) return false;
      if (selectedSlot !== 'all' && slot.slot !== selectedSlot) return false;
      return true;
    });
  }, [result, selectedCallType, selectedSlot]);

  const totalDuration = result?.fileInfo.duration
    ? result.fileInfo.duration * 1000
    : 120000;

  const chartHeight = 160;
  const slotRowHeight = 60;
  const labelWidth = 80;
  const chartWidth = containerWidth - labelWidth - 32;

  const timeTicks = useMemo(() => {
    const ticks = [];
    const interval = totalDuration > 60000 ? 10000 : 5000;
    for (let t = 0; t <= totalDuration; t += interval) {
      ticks.push(t);
    }
    return ticks;
  }, [totalDuration]);

  if (!result) {
    return (
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">时隙占用图</h2>
        <div className="h-40 flex items-center justify-center text-gray-500">
          导入并分析文件后显示时隙占用情况
        </div>
      </div>
    );
  }

  const getX = (time: number) => (time / totalDuration) * chartWidth;

  const handleMouseMove = (e: React.MouseEvent, slot: TimeSlotOccupancy) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setHoveredSlot({
        slot,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredSlot(null);
  };

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700 relative">
      <h2 className="text-lg font-semibold text-gray-200 mb-4">时隙占用图</h2>

      <div ref={containerRef} className="relative">
        <svg width="100%" height={chartHeight} className="overflow-visible">
          <defs>
            <pattern id="grid" width={getX(timeTicks[1] || 10000)} height="20" patternUnits="userSpaceOnUse">
              <path d={`M ${getX(timeTicks[1] || 10000)} 0 L 0 0 0 20`} fill="none" stroke="rgba(75, 85, 99, 0.3)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect x={labelWidth} y="0" width={chartWidth} height={chartHeight - 30} fill="url(#grid)" />

          {timeTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={labelWidth + getX(tick)}
                y1="0"
                x2={labelWidth + getX(tick)}
                y2={chartHeight - 30}
                stroke="rgba(75, 85, 99, 0.5)"
                strokeWidth="1"
              />
              <text
                x={labelWidth + getX(tick)}
                y={chartHeight - 8}
                textAnchor="middle"
                className="fill-gray-500 text-[10px] font-mono"
              >
                {formatTime(tick)}
              </text>
            </g>
          ))}

          {([1, 2] as DmrSlot[]).map((slotNum, index) => {
            const y = index * slotRowHeight + 10;
            const slotsForRow = filteredSlots.filter((s) => s.slot === slotNum);

            return (
              <g key={slotNum}>
                <text
                  x="8"
                  y={y + 28}
                  className="fill-gray-400 text-sm font-medium"
                >
                  时隙 {slotNum}
                </text>

                <rect
                  x={labelWidth}
                  y={y}
                  width={chartWidth}
                  height={slotRowHeight - 20}
                  fill="rgba(31, 41, 55, 0.5)"
                  rx="4"
                />

                {slotsForRow.map((slot, slotIndex) => {
                  const startX = getX(slot.startTime);
                  const width = Math.max(4, getX(slot.endTime - slot.startTime));
                  const color = CALL_TYPE_COLORS[slot.callType];

                  return (
                    <g key={slotIndex}>
                      <rect
                        x={labelWidth + startX}
                        y={y + 4}
                        width={width}
                        height={slotRowHeight - 28}
                        fill={color}
                        rx="3"
                        className="cursor-pointer transition-opacity hover:opacity-80"
                        style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
                        onMouseMove={(e) => handleMouseMove(e, slot)}
                        onMouseLeave={handleMouseLeave}
                      />
                      {width > 60 && (
                        <text
                          x={labelWidth + startX + width / 2}
                          y={y + 24}
                          textAnchor="middle"
                          className="fill-white text-[10px] font-medium pointer-events-none"
                        >
                          {CALL_TYPE_LABELS[slot.callType]}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {hoveredSlot && (
          <div
            className="absolute z-10 bg-gray-900/95 backdrop-blur-md rounded-lg p-3 border border-gray-600 shadow-xl pointer-events-none"
            style={{
              left: hoveredSlot.x + 12,
              top: hoveredSlot.y - 80,
              minWidth: '180px',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: CALL_TYPE_COLORS[hoveredSlot.slot.callType] }}
              />
              <span className="text-sm font-medium text-gray-200">
                {CALL_TYPE_LABELS[hoveredSlot.slot.callType]}
              </span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">时隙</span>
                <span className="text-gray-300 font-mono">{hoveredSlot.slot.slot}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">开始</span>
                <span className="text-gray-300 font-mono">{formatTime(hoveredSlot.slot.startTime)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">时长</span>
                <span className="text-gray-300 font-mono">{formatDuration(hoveredSlot.slot.duration)}</span>
              </div>
              {hoveredSlot.slot.sourceId && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">源ID</span>
                  <span className="text-gray-300 font-mono">{hoveredSlot.slot.sourceId}</span>
                </div>
              )}
              {hoveredSlot.slot.destinationId && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">目标ID</span>
                  <span className="text-gray-300 font-mono">{hoveredSlot.slot.destinationId}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-700">
        {(Object.keys(CALL_TYPE_COLORS) as CallType[]).map((type) => (
          <div key={type} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: CALL_TYPE_COLORS[type] }}
            />
            <span className="text-xs text-gray-400">{CALL_TYPE_LABELS[type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
