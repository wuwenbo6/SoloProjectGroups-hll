import type { ParsedFrame } from '../types';
import MacHeaderPanel from './MacHeaderPanel';
import SofPanel from './SofPanel';
import SignalingPanel from './SignalingPanel';
import HexViewer from './HexViewer';
import { cn } from '../lib/utils';

interface Props {
  frames: ParsedFrame[];
}

const FRAME_TYPE_COLORS: Record<string, string> = {
  MAC: 'bg-blue-500/20 text-blue-300',
  BEACON: 'bg-emerald-500/20 text-emerald-300',
  SACK: 'bg-amber-500/20 text-amber-300',
  UNKNOWN: 'bg-slate-500/20 text-slate-400',
};

export default function FrameResults({ frames }: Props) {
  return (
    <div className="space-y-4">
      {frames.map((frame, index) => (
        <div
          key={frame.frameIndex}
          className="animate-in fade-in slide-in-from-bottom-2 space-y-3 rounded-xl border border-slate-700/30 bg-slate-900/50 p-4"
          style={{ animationDelay: `${index * 150}ms`, animationFillMode: 'both' }}
        >
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-slate-500">帧 #{frame.frameIndex}</span>
            <span
              className={cn(
                'rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase',
                FRAME_TYPE_COLORS[frame.frameType] || FRAME_TYPE_COLORS.UNKNOWN
              )}
            >
              {frame.frameType}
            </span>
            {frame.reassembly.isSegmented && (
              <ReassemblyBadge reassembly={frame.reassembly} />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <MacHeaderPanel macHeader={frame.macHeader} />
            <SofPanel sof={frame.sof} />
          </div>

          <SignalingPanel signaling={frame.signaling} />

          {frame.reassembly.isSegmented && frame.reassembly.reassemblyComplete && frame.reassembly.reassembledHex && (
            <ReassemblyPanel reassembledHex={frame.reassembly.reassembledHex} />
          )}

          <HexViewer rawHex={frame.rawHex} />
        </div>
      ))}
    </div>
  );
}

function ReassemblyBadge({ reassembly }: { reassembly: ParsedFrame['reassembly'] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn(
        'rounded px-1.5 py-0.5 font-mono text-[10px] font-bold',
        reassembly.reassemblyComplete
          ? 'bg-[#00E5CC]/20 text-[#00E5CC]'
          : 'bg-amber-500/20 text-amber-300'
      )}>
        {reassembly.reassemblyComplete ? '重组完成' : '部分重组'}
      </span>
      <span className="font-mono text-[10px] text-slate-500">
        {reassembly.receivedSegments}/{reassembly.totalSegments} 段
      </span>
    </div>
  );
}

function ReassemblyPanel({ reassembledHex }: { reassembledHex: string }) {
  return (
    <div className="rounded-xl border border-[#00E5CC]/20 bg-[#00E5CC]/5 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <span className="inline-block h-2 w-2 rounded-full bg-[#00E5CC]" />
        重组后数据
        <span className="ml-auto rounded bg-[#00E5CC]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#00E5CC]">
          {reassembledHex.length / 2} bytes
        </span>
      </h3>
      <HexViewer rawHex={reassembledHex.length > 1024 ? reassembledHex.slice(0, 1024) : reassembledHex} />
      {reassembledHex.length > 1024 && (
        <span className="mt-1 text-[10px] text-slate-600">
          截断显示前 512 字节，共 {reassembledHex.length / 2} 字节
        </span>
      )}
    </div>
  );
}
