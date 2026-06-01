import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, RotateCcw, Zap, Radio } from 'lucide-react';
import { cn } from '../lib/utils';

interface Station {
  id: number;
  tei: number;
  backoff: number;
  cw: number;
  cwMin: number;
  cwMax: number;
  transmitting: boolean;
  collided: boolean;
  successful: number;
  collisions: number;
}

interface Props {
  stationTEIs?: number[];
}

const DEFAULT_TEIS = [1, 3, 5, 7, 9];

export default function CsmaCaSimulation({ stationTEIs = DEFAULT_TEIS }: Props) {
  const [stations, setStations] = useState<Station[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(300);
  const [channelBusy, setChannelBusy] = useState(false);
  const [activeStation, setActiveStation] = useState<number | null>(null);
  const [timeSlot, setTimeSlot] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const uniqueTEIs = [...new Set(stationTEIs)].slice(0, 6);
  const displayTEIs = uniqueTEIs.length >= 2 ? uniqueTEIs : DEFAULT_TEIS;

  useEffect(() => {
    const initialStations: Station[] = displayTEIs.map((tei, idx) => ({
      id: idx,
      tei,
      backoff: Math.floor(Math.random() * 8),
      cw: 8,
      cwMin: 8,
      cwMax: 64,
      transmitting: false,
      collided: false,
      successful: 0,
      collisions: 0,
    }));
    setStations(initialStations);
  }, [displayTEIs.join(',')]);

  const tick = useCallback(() => {
    setStations((prev) => {
      const transmitting = prev.filter((s) => s.transmitting);

      if (transmitting.length > 0) {
        setChannelBusy(true);

        if (transmitting.length > 1) {
          return prev.map((s) => {
            if (s.transmitting) {
              const newCw = Math.min(s.cw * 2, s.cwMax);
              return {
                ...s,
                transmitting: false,
                collided: true,
                collisions: s.collisions + 1,
                cw: newCw,
                backoff: Math.floor(Math.random() * newCw),
              };
            }
            return s;
          });
        } else {
          setActiveStation(transmitting[0].id);
          return prev.map((s) => {
            if (s.transmitting) {
              return {
                ...s,
                transmitting: false,
                successful: s.successful + 1,
                cw: s.cwMin,
                backoff: Math.floor(Math.random() * s.cwMin),
                collided: false,
              };
            }
            return s;
          });
        }
      } else {
        setChannelBusy(false);
        setActiveStation(null);
      }

      let transmittingCount = 0;
      const newStations = prev.map((s) => {
        if (s.backoff === 0) {
          transmittingCount++;
          return { ...s, transmitting: true, collided: false };
        }
        return { ...s, backoff: s.backoff - 1, collided: false };
      });

      if (transmittingCount > 1) {
        setChannelBusy(true);
      }

      return newStations;
    });
    setTimeSlot((t) => t + 1);
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(tick, speed);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, speed, tick]);

  const reset = useCallback(() => {
    setIsRunning(false);
    setTimeSlot(0);
    setChannelBusy(false);
    setActiveStation(null);
    setStations((prev) =>
      prev.map((s) => ({
        ...s,
        backoff: Math.floor(Math.random() * s.cwMin),
        cw: s.cwMin,
        transmitting: false,
        collided: false,
        successful: 0,
        collisions: 0,
      }))
    );
  }, []);

  const totalSuccess = stations.reduce((a, s) => a + s.successful, 0);
  const totalCollisions = stations.reduce((a, s) => a + s.collisions, 0);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Radio className="h-4 w-4 text-purple-400" />
        CSMA/CA 退避模拟
      </h3>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setIsRunning(!isRunning)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            isRunning
              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
              : 'bg-[#00E5CC]/20 text-[#00E5CC] hover:bg-[#00E5CC]/30'
          )}
        >
          {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {isRunning ? '暂停' : '开始'}
        </button>

        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-300"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重置
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">速度:</span>
          <input
            type="range"
            min="50"
            max="1000"
            step="50"
            value={1050 - speed}
            onChange={(e) => setSpeed(1050 - Number(e.target.value))}
            className="h-1.5 w-24 cursor-pointer appearance-none rounded bg-slate-700 accent-[#00E5CC]"
          />
        </div>

        <span className="ml-auto text-xs text-slate-500">
          时隙: <span className="font-mono text-slate-300">{timeSlot}</span>
        </span>
      </div>

      <div className="mb-4 flex items-center justify-center gap-6 rounded-lg bg-slate-900/50 p-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-3 w-3 rounded-full transition-colors duration-150',
              channelBusy ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]' : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]'
            )}
          />
          <span className="text-xs text-slate-400">
            信道: {channelBusy ? '忙' : '空闲'}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          成功: <span className="font-mono text-green-400">{totalSuccess}</span>
        </div>
        <div className="text-xs text-slate-500">
          冲突: <span className="font-mono text-red-400">{totalCollisions}</span>
        </div>
      </div>

      <div className="space-y-2">
        {stations.map((station) => (
          <StationRow key={station.id} station={station} isActive={activeStation === station.id} />
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-slate-700/30 bg-slate-900/30 p-3">
        <p className="text-[10px] leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-400">CSMA/CA 原理:</span> 每个终端在发送前监听信道，若信道空闲则开始退避计数(Contention Window)。
          计数到0时尝试发送。若多个终端同时发送则发生冲突，冲突终端翻倍竞争窗口并重新退避。
        </p>
      </div>
    </div>
  );
}

function StationRow({ station, isActive }: { station: Station; isActive: boolean }) {
  const progress = (station.backoff / station.cw) * 100;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-2 transition-all duration-200',
        isActive
          ? 'border-[#00E5CC]/50 bg-[#00E5CC]/10 shadow-[0_0_15px_rgba(0,229,204,0.1)]'
          : station.transmitting
          ? 'border-amber-500/50 bg-amber-500/10'
          : station.collided
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-slate-700/30 bg-slate-800/30'
      )}
    >
      <div className="flex w-16 flex-col items-center">
        <span className="font-mono text-xs font-bold text-slate-300">TEI {station.tei}</span>
        <span className="text-[10px] text-slate-500">CW={station.cw}</span>
      </div>

      <div className="flex-1">
        <div className="relative h-5 overflow-hidden rounded bg-slate-700/50">
          <div
            className={cn(
              'h-full transition-all duration-150',
              isActive
                ? 'bg-[#00E5CC] shadow-[0_0_10px_rgba(0,229,204,0.5)]'
                : station.transmitting
                ? 'bg-amber-500'
                : 'bg-slate-600'
            )}
            style={{ width: `${100 - progress}%` }}
          />
          {station.transmitting && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-white animate-pulse" />
            </div>
          )}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>退避: {station.backoff}</span>
          <span>
            <span className="text-green-400">{station.successful}✓</span>
            {' / '}
            <span className="text-red-400">{station.collisions}✗</span>
          </span>
        </div>
      </div>
    </div>
  );
}
