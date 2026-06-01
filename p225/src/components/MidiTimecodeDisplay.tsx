import { Music, Music2, Clock } from 'lucide-react';
import type { MidiTimeCode } from '../../shared/types';

interface MidiTimecodeDisplayProps {
  timecode: MidiTimeCode | null;
  connected: boolean;
}

export function MidiTimecodeDisplay({
  timecode,
  connected,
}: MidiTimecodeDisplayProps) {
  if (!timecode && !connected) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-console-bg rounded-lg border border-console-border">
        <div className="w-2 h-2 rounded-full bg-console-muted animate-pulse" />
        <span className="text-sm text-console-muted font-mono">MTC 未连接</span>
      </div>
    );
  }

  const parts = timecode?.full?.split(':') || ['00', '00', '00', '00'];

  return (
    <div className="flex items-center gap-3 px-5 py-3 bg-console-bg rounded-lg border border-console-border shadow-inner">
      <div className="flex items-center gap-2">
        {connected ? (
          <Music size={18} className="text-console-active" />
        ) : (
          <Music2 size={18} className="text-console-muted" />
        )}
        <div
          className={`w-2 h-2 rounded-full ${
            connected ? 'bg-console-active connected-indicator' : 'bg-console-muted'
          }`}
        />
      </div>

      <div className="flex items-baseline gap-1 font-mono">
        <TimeSegment value={parts[0]} label="时" />
        <span className="text-console-accent text-xl font-bold">:</span>
        <TimeSegment value={parts[1]} label="分" />
        <span className="text-console-accent text-xl font-bold">:</span>
        <TimeSegment value={parts[2]} label="秒" />
        <span className="text-console-accent text-xl font-bold">:</span>
        <TimeSegment value={parts[3]} label="帧" highlight />
      </div>

      {timecode && (
        <div className="flex flex-col items-center">
          <Clock size={12} className="text-console-muted mb-0.5" />
          <span className="text-[10px] text-console-muted font-mono">
            {timecode.rate === '24'
              ? '24fps'
              : timecode.rate === '25'
              ? '25fps'
              : timecode.rate === '30drop'
              ? '29.97df'
              : '30fps'}
          </span>
        </div>
      )}
    </div>
  );
}

function TimeSegment({
  value,
  label,
  highlight = false,
}: {
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`text-2xl font-bold tabular-nums ${
          highlight ? 'text-console-accent' : 'text-console-text'
        }`}
      >
        {value}
      </span>
      <span className="text-[10px] text-console-muted uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
