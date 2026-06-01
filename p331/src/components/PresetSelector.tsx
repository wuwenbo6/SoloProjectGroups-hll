import { Network, ArrowRightLeft, Users, UserMinus } from 'lucide-react';
import type { PresetType } from '@/types/simulator';

interface PresetSelectorProps {
  activePreset: PresetType | null;
  onSelect: (preset: PresetType) => void;
}

const presets: { type: PresetType; label: string; icon: React.ReactNode }[] = [
  { type: 'BASIC_RPT', label: '基础 RPT 建立', icon: <Network className="w-4 h-4" /> },
  { type: 'SPT_SWITCH', label: 'SPT 切换', icon: <ArrowRightLeft className="w-4 h-4" /> },
  { type: 'MULTI_SOURCE', label: '多源组播', icon: <Users className="w-4 h-4" /> },
  { type: 'PRUNE_LEAVE', label: '剪枝与离开', icon: <UserMinus className="w-4 h-4" /> },
];

export default function PresetSelector({ activePreset, onSelect }: PresetSelectorProps) {
  return (
    <div className="h-12 bg-gray-900/80 border-b border-gray-700/50 flex items-center px-4 gap-3">
      <span className="text-xs text-gray-500 uppercase tracking-widest mr-2">场景:</span>
      {presets.map((p) => {
        const active = activePreset === p.type;
        return (
          <button
            key={p.type}
            onClick={() => onSelect(p.type)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200
              ${
                active
                  ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                  : 'bg-gray-800/50 text-gray-400 border border-gray-700/30 hover:bg-gray-700/50 hover:text-gray-300'
              }
            `}
          >
            {p.icon}
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
