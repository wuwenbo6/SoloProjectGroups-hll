import type { MacHeader } from '../types';
import { cn } from '../lib/utils';

interface Props {
  macHeader: MacHeader;
}

export default function MacHeaderPanel({ macHeader }: Props) {
  const isBroadcast = macHeader.destinationTEI === 0xff;
  const isSegmented = macHeader.totalSegments > 1;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <span className="inline-block h-2 w-2 rounded-full bg-[#00E5CC]" />
        MAC 报头
      </h3>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <Field label="帧控制" value={macHeader.frameControl} hex />
        <Field label="帧控制扩展" value={macHeader.frameControlExt} hex />
        <Field label="分隔类型" value={macHeader.delimiterTypeName} />
        <Field label="段信息" value={macHeader.segmentInfo} hex />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">目的 TEI</span>
          <TeiBadge value={macHeader.destinationTEI} isBroadcast={isBroadcast} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">源 TEI</span>
          <TeiBadge value={macHeader.sourceTEI} />
        </div>
      </div>

      <div className="mt-3 border-t border-slate-700/50 pt-3">
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          分段控制
        </span>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-600">当前段</span>
            <span className={cn(
              'font-mono text-xs font-bold',
              isSegmented ? 'text-purple-300' : 'text-slate-500'
            )}>
              #{macHeader.segmentNumber}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-600">总段数</span>
            <span className={cn(
              'font-mono text-xs font-bold',
              isSegmented ? 'text-purple-300' : 'text-slate-500'
            )}>
              {macHeader.totalSegments}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-600">末段标志</span>
            <span className={cn(
              'font-mono text-xs font-bold',
              macHeader.lastSegment ? 'text-[#00E5CC]' : 'text-slate-600'
            )}>
              {macHeader.lastSegment ? 'END' : '—'}
            </span>
          </div>
        </div>

        {isSegmented && (
          <div className="mt-2 flex items-center gap-1">
            {Array.from({ length: macHeader.totalSegments }, (_, i) => (
              <div
                key={i}
                className={cn(
                  'h-2 flex-1 rounded-sm',
                  i < macHeader.segmentNumber + 1
                    ? 'bg-[#00E5CC]/60'
                    : 'bg-slate-700/50'
                )}
                title={`段 ${i}`}
              />
            ))}
            <span className="ml-1 text-[10px] text-slate-600">
              {macHeader.segmentNumber + 1}/{macHeader.totalSegments}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, hex }: { label: string; value: string | number; hex?: boolean }) {
  const display = typeof value === 'number' && hex
    ? `0x${value.toString(16).toUpperCase().padStart(2, '0')} (${value})`
    : String(value);

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="font-mono text-xs text-slate-300">{display}</span>
    </div>
  );
}

function TeiBadge({ value, isBroadcast }: { value: number; isBroadcast?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold',
        isBroadcast
          ? 'bg-amber-500/20 text-amber-300'
          : 'bg-[#00E5CC]/15 text-[#00E5CC] shadow-[0_0_8px_rgba(0,229,204,0.3)]'
      )}
    >
      {isBroadcast ? 'BCAST' : value}
    </span>
  );
}
