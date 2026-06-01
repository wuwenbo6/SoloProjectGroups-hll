import type { SignalingInfo } from '../types';
import { cn } from '../lib/utils';

interface Props {
  signaling: SignalingInfo;
}

export default function SignalingPanel({ signaling }: Props) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
        信令信息
      </h3>

      <div className="space-y-4">
        <SackSection
          present={signaling.sack.present}
          ackBitmap={signaling.sack.ackBitmap}
          acknowledgedSegments={signaling.sack.acknowledgedSegments}
        />

        {signaling.beacon.present && (
          <BeaconSection beacon={signaling.beacon} />
        )}

        {!signaling.beacon.present && signaling.ccoInfo.present && (
          <CcoSection ccoInfo={signaling.ccoInfo} />
        )}
      </div>
    </div>
  );
}

function SackSection({
  present,
  ackBitmap,
  acknowledgedSegments,
}: {
  present: boolean;
  ackBitmap: string;
  acknowledgedSegments: number[];
}) {
  if (!present) {
    return (
      <div>
        <span className="text-xs text-slate-500">SACK</span>
        <span className="ml-2 text-xs text-slate-600">未检测到</span>
      </div>
    );
  }

  const maxDisplayBits = 64;
  const displayBitmap = ackBitmap.slice(0, maxDisplayBits);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-amber-300">SACK 选择性确认</span>
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
          {acknowledgedSegments.length} segments ACK
        </span>
      </div>

      <div className="flex flex-wrap gap-px">
        {displayBitmap.split('').map((bit, i) => (
          <div
            key={i}
            className={cn(
              'flex h-5 w-5 items-center justify-center font-mono text-[9px]',
              bit === '1'
                ? 'bg-[#00E5CC]/30 text-[#00E5CC]'
                : 'bg-slate-700/40 text-slate-600'
            )}
            title={`段 ${i}: ${bit === '1' ? '已确认' : '未确认'}`}
          >
            {bit}
          </div>
        ))}
      </div>

      {ackBitmap.length > maxDisplayBits && (
        <span className="mt-1 text-[10px] text-slate-600">
          显示前 {maxDisplayBits} 位，共 {ackBitmap.length} 位
        </span>
      )}
    </div>
  );
}

function BeaconSection({
  beacon,
}: {
  beacon: {
    present: boolean;
    nid: string;
    nidVersion: number;
    ccoMacAddress: string;
    ccoTEI: number;
    stationRole: string;
    beaconPeriod: number;
    beaconTimeStamp: number;
  };
}) {
  if (!beacon.present) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-emerald-300">信标帧 (Beacon)</span>
        <div className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-[10px] text-emerald-400">活跃</span>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">
          网络标识 (NID)
        </div>
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-emerald-500/15 px-2 py-1 font-mono text-xs font-bold text-emerald-300">
            {beacon.nid || '—'}
          </span>
          <span className="text-[10px] text-slate-600">
            版本: {beacon.nidVersion}
          </span>
        </div>

        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">
          CCo 中心协调器
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">CCo TEI</span>
            <span className="font-mono text-xs font-bold text-[#00E5CC]">{beacon.ccoTEI}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">CCo MAC 地址</span>
            <span className="font-mono text-xs text-emerald-300">{beacon.ccoMacAddress || '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">站点角色</span>
            <RoleBadge role={beacon.stationRole} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">信标周期</span>
            <span className="font-mono text-xs text-slate-300">{beacon.beaconPeriod} ms</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">信标时间戳</span>
            <span className="font-mono text-xs text-slate-300">0x{beacon.beaconTimeStamp.toString(16).toUpperCase().padStart(8, '0')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CcoSection({
  ccoInfo,
}: {
  ccoInfo: {
    present: boolean;
    ccoTEI: number;
    networkId: string;
    nidFormatted: string;
    ccoMacAddress: string;
    stationRole: string;
    beaconPeriod: number;
    beaconTimeStamp: number;
  };
}) {
  if (!ccoInfo.present) {
    return (
      <div>
        <span className="text-xs text-slate-500">CCo 信息</span>
        <span className="ml-2 text-xs text-slate-600">未检测到</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-emerald-300">CCo 中心协调器</span>
        <div className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-[10px] text-emerald-400">在线</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        <FieldRow label="CCo TEI" value={ccoInfo.ccoTEI} accent />
        <FieldRow label="站点角色" value={ccoInfo.stationRole} />
        <FieldRow label="网络 ID" value={ccoInfo.networkId} mono />
        <FieldRow label="NID 格式化" value={ccoInfo.nidFormatted || '—'} mono />
        <FieldRow label="CCo MAC" value={ccoInfo.ccoMacAddress || '—'} mono />
        <FieldRow label="信标周期" value={`${ccoInfo.beaconPeriod} ms`} />
        <FieldRow label="信标时间戳" value={`0x${ccoInfo.beaconTimeStamp.toString(16).toUpperCase().padStart(8, '0')}`} mono />
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    CCo: 'bg-emerald-500/20 text-emerald-300',
    Proxy: 'bg-blue-500/20 text-blue-300',
    Station: 'bg-slate-500/20 text-slate-400',
  };

  return (
    <span className={cn(
      'rounded px-1.5 py-0.5 font-mono text-[10px] font-bold',
      colors[role] || 'bg-slate-500/20 text-slate-400'
    )}>
      {role}
    </span>
  );
}

function FieldRow({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={cn(
          'text-xs',
          mono && 'font-mono',
          accent ? 'font-bold text-[#00E5CC]' : 'text-slate-300'
        )}
      >
        {value}
      </span>
    </div>
  );
}
