import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, MoveHorizontal } from 'lucide-react';
import { ParseResult, NALUnit, NAL_TYPE_COLORS, NAL_TYPE_NAMES } from '../types';
import { formatBytes } from '../utils/h265Parser';

interface GOPTimelineProps {
  result: ParseResult;
}

interface HoveredNAL {
  nal: NALUnit;
  x: number;
  y: number;
}

export const GOPTimeline: React.FC<GOPTimelineProps> = ({ result }) => {
  const { nalUnits, gopStructure } = result;
  const [zoom, setZoom] = useState(1);
  const [hoveredNAL, setHoveredNAL] = useState<HoveredNAL | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const maxVisible = Math.min(200, nalUnits.length);
  const displayUnits = nalUnits.slice(0, maxVisible);

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.5, 10));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.5, 0.5));

  const barWidth = Math.max(4, 8 * zoom);
  const gap = Math.max(1, 2 * zoom);

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          GOP 结构与帧序列
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 mr-2">缩放:</span>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 transition-colors"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        {['VPS', 'SPS', 'PPS', 'IDR', 'P', 'B', 'RASL', 'RADL', 'AUD', 'SEI'].map((type) => (
          <div key={type} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: NAL_TYPE_COLORS[type as keyof typeof NAL_TYPE_COLORS] }}
            />
            <span className="text-xs text-gray-400">{type}</span>
          </div>
        ))}
      </div>

      {gopStructure.length > 0 && (
        <div className="mb-4 p-3 bg-gray-900/50 rounded-lg">
          <p className="text-sm text-gray-400 mb-2">GOP 统计:</p>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-lg font-bold text-white">{gopStructure.length}</p>
              <p className="text-xs text-gray-500">GOP 数量</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">
                {gopStructure.length > 0
                  ? Math.round(
                      gopStructure.reduce((sum, g) => sum + g.frameCount, 0) / gopStructure.length
                    )
                  : 0}
              </p>
              <p className="text-xs text-gray-500">平均 GOP 长度</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">
                {gopStructure.length > 0
                  ? Math.max(...gopStructure.map((g) => g.frameCount))
                  : 0}
              </p>
              <p className="text-xs text-gray-500">最大 GOP 长度</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">
                {gopStructure.length > 0
                  ? formatBytes(
                      Math.round(gopStructure.reduce((sum, g) => sum + g.size, 0) / gopStructure.length)
                    )
                  : 0}
              </p>
              <p className="text-xs text-gray-500">平均 GOP 大小</p>
            </div>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative overflow-x-auto overflow-y-hidden bg-gray-900/50 rounded-lg p-4"
        style={{ maxHeight: '200px' }}
      >
        <div
          className="flex items-end gap-0.5 h-32 relative"
          style={{
            width: `${displayUnits.length * (barWidth + gap)}px`,
            minWidth: '100%',
          }}
        >
          {displayUnits.map((nal, index) => {
            const height = Math.min(100, Math.max(10, (nal.size / 10000) * 100 * zoom));

            return (
              <div
                key={index}
                className="relative flex-shrink-0 cursor-pointer transition-all duration-150 hover:opacity-80"
                style={{
                  width: `${barWidth}px`,
                  marginRight: `${gap}px`,
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const containerRect = containerRef.current?.getBoundingClientRect();
                  if (containerRect) {
                    setHoveredNAL({
                      nal,
                      x: rect.left - containerRect.left + rect.width / 2,
                      y: rect.top - containerRect.top - 10,
                    });
                  }
                }}
                onMouseLeave={() => setHoveredNAL(null)}
              >
                <div
                  className="w-full rounded-t transition-all duration-150"
                  style={{
                    height: `${height}%`,
                    backgroundColor: NAL_TYPE_COLORS[nal.type],
                    minHeight: '8px',
                  }}
                />
                {nal.type === 'IDR' && (
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
                )}
              </div>
            );
          })}
        </div>

        {hoveredNAL && (
          <div
            className="absolute z-20 pointer-events-none bg-gray-900 border border-gray-600 rounded-lg p-3 shadow-xl min-w-[200px]"
            style={{
              left: `${Math.min(hoveredNAL.x, (containerRef.current?.clientWidth || 300) - 220)}px`,
              top: `${Math.max(hoveredNAL.y - 120, 10)}px`,
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-xs font-bold text-white"
                  style={{ backgroundColor: NAL_TYPE_COLORS[hoveredNAL.nal.type] }}
                >
                  {hoveredNAL.nal.type}
                </span>
                <span className="text-sm text-gray-300">{NAL_TYPE_NAMES[hoveredNAL.nal.type]}</span>
              </div>
              <div className="text-xs text-gray-400 space-y-1">
                <p>索引: #{hoveredNAL.nal.index}</p>
                <p>类型码: {hoveredNAL.nal.typeCode}</p>
                <p>大小: {formatBytes(hoveredNAL.nal.size)}</p>
                <p>偏移: 0x{hoveredNAL.nal.offset.toString(16).toUpperCase()}</p>
                <p>Temporal ID: {hoveredNAL.nal.temporalId}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {nalUnits.length > maxVisible && (
        <p className="text-sm text-gray-500 mt-3 text-center">
          仅显示前 {maxVisible} 个 NAL 单元，共 {nalUnits.length} 个
        </p>
      )}
    </div>
  );
};
