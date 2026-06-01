import { HardDrive, X } from 'lucide-react';
import type { SlotStatus } from '@/types';

interface SlotCardProps {
  slot: SlotStatus;
  selected: boolean;
  onClick: () => void;
}

const MODE_PRIORITY: Record<string, number> = {
  'flash': 4,
  'blink': 3,
  'on': 2,
  'off': 1,
};

const getLedAnimation = (mode: string, color: string) => {
  const glowColor = color === 'warning' ? 'orange' : color === 'danger' ? 'red' : 'green';
  switch (mode) {
    case 'flash':
      return `bg-${color} animate-blink-fast animate-glow-${glowColor}`;
    case 'blink':
      return `bg-${color} animate-blink animate-glow-${glowColor}`;
    case 'on':
      return `bg-${color} animate-glow-${glowColor}`;
    default:
      return 'bg-dark-400';
  }
};

export function SlotCard({ slot, selected, onClick }: SlotCardProps) {
  const getActiveLed = () => {
    const modes = [
      { mode: slot.fault, color: 'danger', priority: MODE_PRIORITY[slot.fault] },
      { mode: slot.locate, color: 'warning', priority: MODE_PRIORITY[slot.locate] },
      { mode: slot.active, color: 'success', priority: MODE_PRIORITY[slot.active] },
    ];
    const active = modes.filter(m => m.mode !== 'off');
    if (active.length === 0) return null;
    active.sort((a, b) => b.priority - a.priority);
    return active[0];
  };

  const getBorderColor = () => {
    if (selected) return 'border-primary-500 ring-2 ring-primary-500/30';
    const active = getActiveLed();
    if (active?.color === 'danger') return 'border-danger';
    if (active?.color === 'warning') return 'border-warning';
    if (slot.present && slot.active !== 'off') return 'border-success';
    if (slot.present) return 'border-dark-400';
    return 'border-dark-300';
  };

  const getBgColor = () => {
    if (selected) return 'bg-primary-500/10';
    const active = getActiveLed();
    if (active?.color === 'danger') return 'bg-danger/5';
    if (active?.color === 'warning') return 'bg-warning/5';
    return 'bg-dark-200/50 hover:bg-dark-200';
  };

  return (
    <button
      onClick={onClick}
      className={`
        relative p-3 rounded-xl border-2 transition-all duration-300
        ${getBorderColor()}
        ${getBgColor()}
        hover:scale-[1.02] active:scale-[0.98]
        focus:outline-none
      `}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          {slot.present ? (
            <HardDrive
              className={`w-8 h-8 transition-colors ${
                slot.fault !== 'off'
                  ? 'text-danger'
                  : slot.locate !== 'off'
                  ? 'text-warning'
                  : slot.active !== 'off'
                  ? 'text-success'
                  : 'text-dark-500'
              }`}
            />
          ) : (
            <X className="w-8 h-8 text-dark-400" />
          )}
        </div>

        <span
          className={`font-mono text-sm font-bold ${
            slot.present ? 'text-white' : 'text-dark-400'
          }`}
        >
          #{String(slot.slot).padStart(2, '0')}
        </span>

        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full transition-all ${
              slot.locate !== 'off'
                ? getLedAnimation(slot.locate, 'warning')
                : 'bg-dark-400'
            }`}
            title={`定位灯: ${slot.locate}`}
          />
          <div
            className={`w-2 h-2 rounded-full transition-all ${
              slot.fault !== 'off'
                ? getLedAnimation(slot.fault, 'danger')
                : 'bg-dark-400'
            }`}
            title={`错误灯: ${slot.fault}`}
          />
          <div
            className={`w-2 h-2 rounded-full transition-all ${
              slot.active !== 'off'
                ? getLedAnimation(slot.active, 'success')
                : 'bg-dark-400'
            }`}
            title={`活动灯: ${slot.active}`}
          />
        </div>

        {slot.device && (
          <span className="text-xs font-mono text-dark-500 truncate w-full text-center">
            {slot.device}
          </span>
        )}
      </div>

      {slot.locate !== 'off' && (
        <div className={`absolute inset-0 rounded-xl border-2 border-warning/50 pointer-events-none ${
          slot.locate === 'blink' || slot.locate === 'flash' ? 'animate-pulse' : ''
        }`} />
      )}
    </button>
  );
}
