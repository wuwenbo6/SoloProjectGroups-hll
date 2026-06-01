import type { SofInfo } from '../types';

interface Props {
  sof: SofInfo;
}

export default function SofPanel({ sof }: Props) {
  const bits = sof.frameControlBits;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <span className="inline-block h-2 w-2 rounded-full bg-purple-400" />
        SOF 帧信息
      </h3>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <FieldRow label="音调映射索引 (TMI)" value={sof.toneMapIndex} />
        <FieldRow label="调制方案" value={sof.modulationScheme} accent />
        <FieldRow label="有效载荷长度" value={`${sof.payloadLength} bytes`} />
        <FieldRow label="前导码质量" value={sof.preambleQuality} />
      </div>

      {bits && (
        <div className="mt-3">
          <span className="mb-1 block text-xs text-slate-500">帧控制位</span>
          <div className="flex gap-px">
            {bits.split('').map((bit, i) => (
              <div
                key={i}
                className={`flex h-6 w-6 items-center justify-center font-mono text-[10px] ${
                  bit === '1'
                    ? 'bg-[#00E5CC]/20 text-[#00E5CC]'
                    : 'bg-slate-700/50 text-slate-500'
                }`}
              >
                {bit}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={`font-mono text-xs ${
          accent ? 'font-bold text-purple-300' : 'text-slate-300'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
