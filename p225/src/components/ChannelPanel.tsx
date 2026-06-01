import { useRef, useEffect } from 'react';
import { ChannelFader } from './ChannelFader';
import { CHANNEL_COUNT } from '../../shared/types';

interface ChannelPanelProps {
  channels: number[];
  activeGroup: number;
  groupSize?: number;
  onChannelChange: (channel: number, value: number) => void;
  disabled?: boolean;
}

export function ChannelPanel({
  channels,
  activeGroup,
  groupSize = 32,
  onChannelChange,
  disabled = false,
}: ChannelPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startChannel = activeGroup * groupSize + 1;
  const endChannel = Math.min(startChannel + groupSize - 1, CHANNEL_COUNT);
  const groupChannels = Array.from(
    { length: endChannel - startChannel + 1 },
    (_, i) => startChannel + i
  );

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [activeGroup]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto p-4 bg-console-bg"
    >
      <div className="flex flex-wrap justify-center gap-1">
        {groupChannels.map((channel) => (
          <ChannelFader
            key={channel}
            channel={channel}
            value={channels[channel - 1] || 0}
            onChange={onChannelChange}
            disabled={disabled}
          />
        ))}
      </div>

      <div className="mt-8 p-4 bg-console-panel border border-console-border rounded-lg">
        <h3 className="text-sm font-semibold text-console-muted mb-3 uppercase tracking-wider">
          通道 {startChannel} - {endChannel} 统计
        </h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-console-accent font-mono">
              {groupChannels.filter((c) => channels[c - 1] > 0).length}
            </div>
            <div className="text-xs text-console-muted">活跃通道</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-console-active font-mono">
              {Math.max(...groupChannels.map((c) => channels[c - 1] || 0))}
            </div>
            <div className="text-xs text-console-muted">最大值</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-console-text font-mono">
              {Math.round(
                groupChannels.reduce((sum, c) => sum + (channels[c - 1] || 0), 0) /
                  groupChannels.length
              )}
            </div>
            <div className="text-xs text-console-muted">平均值</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-console-warning font-mono">
              {groupChannels.filter((c) => channels[c - 1] === 255).length}
            </div>
            <div className="text-xs text-console-muted">满值通道</div>
          </div>
        </div>
      </div>
    </div>
  );
}
