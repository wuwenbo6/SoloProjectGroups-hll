import React, { useMemo, useRef, useEffect } from 'react';
import { useSimStore } from '../store/useSimStore';
import type { TimelineEvent } from '../../shared/types';

const TIMELINE_WINDOW = 10000;

export const BusTimeline: React.FC = () => {
  const timeline = useSimStore((s) => s.timeline);
  const nodeConfigs = useSimStore((s) => s.nodeConfigs);
  const nodeStates = useSimStore((s) => s.nodeStates);
  const currentTime = useSimStore((s) => s.currentTime);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);

  const nodeIds = useMemo(() => Object.keys(nodeConfigs), [nodeConfigs]);

  const visibleEvents = useMemo(() => {
    const windowStart = currentTime - TIMELINE_WINDOW;
    return timeline.filter((e) => e.timestamp >= windowStart);
  }, [timeline, currentTime]);

  const eventsByNode = useMemo(() => {
    const byNode: Record<string, TimelineEvent[]> = {};
    nodeIds.forEach((id) => {
      byNode[id] = [];
    });
    visibleEvents.forEach((event) => {
      if (byNode[event.nodeId]) {
        byNode[event.nodeId].push(event);
      }
    });
    return byNode;
  }, [visibleEvents, nodeIds]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [visibleEvents, autoScroll]);

  const getEventColor = (event: TimelineEvent, nodeColor: string): string => {
    switch (event.type) {
      case 'conflict':
        return '#F53F3F';
      case 'retry':
        return '#FF7D00';
      case 'listen_start':
      case 'listen_end':
        return '#F59E0B';
      case 'modbus_request':
        return '#722ED1';
      case 'modbus_response':
        return '#14C9C9';
      case 'modbus_timeout':
        return '#F53F3F';
      default:
        return nodeColor;
    }
  };

  const getEventLabel = (event: TimelineEvent): string => {
    switch (event.type) {
      case 'send_start':
        return '发送';
      case 'send_end':
        return '结束';
      case 'conflict':
        return '冲突';
      case 'retry':
        return '重试';
      case 'listen_start':
        return '监听';
      case 'modbus_request':
        return '请求';
      case 'modbus_response':
        return '响应';
      case 'modbus_timeout':
        return '超时';
      default:
        return '';
    }
  };

  const renderTimeMarkers = useMemo(() => {
    const markers = [];
    const now = currentTime;
    for (let i = 0; i <= 10; i++) {
      const time = now - (TIMELINE_WINDOW * (i / 10));
      markers.push({
        time,
        label: `${((now - time) / 1000).toFixed(1)}s`,
      });
    }
    return markers;
  }, [currentTime]);

  return (
    <div className="card p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-500" />
          总线时序图
        </h2>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
          />
          自动滚动
        </label>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex text-xs text-slate-500 mb-1 flex-shrink-0">
          <div className="w-24 flex-shrink-0" />
          <div className="flex-1 relative h-6 border-b border-slate-700/50">
            {renderTimeMarkers.map((marker, i) => (
              <div
                key={i}
                className="absolute top-0 transform -translate-x-1/2"
                style={{
                  left: `${100 - i * 10}%`,
                }}
              >
                {marker.label}
              </div>
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-auto scrollbar-thin"
          onScroll={() => {
            if (autoScroll) setAutoScroll(false);
          }}
        >
          <div className="min-w-[1000px]">
            {nodeIds.map((nodeId) => {
              const config = nodeConfigs[nodeId];
              const state = nodeStates[nodeId];
              const events = eventsByNode[nodeId] || [];

              return (
                <div key={nodeId} className="flex items-center h-9">
                  <div className="w-24 flex-shrink-0 flex items-center gap-2 px-2 border-r border-slate-700/50 h-full">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: config.color }}
                    />
                    <span className="text-sm text-slate-300 truncate">{config.name}</span>
                  </div>
                  <div className="relative flex-1 h-9 border-b border-slate-700/50 bg-slate-900/30">
                    {events.map((event) => {
                      const timeOffset = currentTime - event.timestamp;
                      const leftPercent = 100 - (timeOffset / TIMELINE_WINDOW) * 100;
                      const width = event.duration
                        ? Math.max((event.duration / TIMELINE_WINDOW) * 100, 0.5)
                        : 0.5;
                      const color = getEventColor(event, config.color);

                      return (
                        <div
                          key={event.id}
                          className="absolute top-1/2 -translate-y-1/2 h-6 rounded flex items-center justify-center text-[10px] font-medium text-white/80 bar-animate"
                          style={{
                            left: `${leftPercent}%`,
                            width: `${width}%`,
                            backgroundColor: color,
                            opacity: event.type === 'conflict' ? 1 : 0.85,
                            boxShadow:
                              event.type === 'conflict'
                                ? '0 0 12px rgba(245, 63, 63, 0.8)'
                                : `0 0 8px ${color}60`,
                          }}
                          title={`${getEventLabel(event)} ${
                            event.duration ? `${event.duration.toFixed(0)}ms` : ''
                          }`}
                        >
                          {width > 3 && (
                            <span className="truncate px-1">{getEventLabel(event)}</span>
                          )}
                        </div>
                      );
                    })}

                    {state &&
                      state.status !== 'idle' &&
                      state.status !== 'success' && (
                        <div className="absolute right-0 top-0 h-full flex items-center">
                          <div
                            className="h-6 rounded-l flex items-center justify-center text-[10px] font-medium text-white"
                            style={{
                              backgroundColor: config.color,
                              boxShadow: `0 0 12px ${config.color}80`,
                              animation: 'pulse 1s ease-in-out infinite',
                            }}
                          >
                            <span className="px-2">
                              {state.status === 'sending'
                                ? '发送中'
                                : state.status === 'listening'
                                ? '监听中'
                                : state.status === 'conflict'
                                ? '冲突'
                                : state.status === 'waiting'
                                ? '等待'
                                : state.status === 'responding'
                                ? '响应中'
                                : ''}
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700/50 text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: '#165DFF' }} />
          <span>发送</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: '#F59E0B' }} />
          <span>监听</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: '#FF7D00' }} />
          <span>重试</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: '#F53F3F' }} />
          <span>冲突</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: '#722ED1' }} />
          <span>请求</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: '#14C9C9' }} />
          <span>响应</span>
        </div>
      </div>
    </div>
  );
};
