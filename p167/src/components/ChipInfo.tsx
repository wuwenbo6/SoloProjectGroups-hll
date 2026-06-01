import React from 'react';
import { Cpu, Pin, Ruler, Hash, FileCode, Clock, Package, Factory, X } from 'lucide-react';
import { ChipInfo as ChipInfoType } from '../types';
import { useBSDLStore } from '../hooks/useBSDLStore';

interface ChipInfoProps {
  chip: ChipInfoType;
  isSelected?: boolean;
  onSelect?: () => void;
  showRemove?: boolean;
  compact?: boolean;
}

export const ChipInfoCard: React.FC<ChipInfoProps> = ({ 
  chip, 
  isSelected = false, 
  onSelect,
  showRemove = false,
  compact = false
}) => {
  const { removeChip } = useBSDLStore();

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeChip(chip.id);
  };

  if (compact) {
    return (
      <div
        onClick={onSelect}
        className={`p-3 rounded-lg border cursor-pointer transition-all duration-200
          ${isSelected 
            ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/20' 
            : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
          }
        `}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span className="font-mono text-sm text-slate-200">{chip.name}</span>
          </div>
          {showRemove && (
            <button
              onClick={handleRemove}
              className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="mt-1 text-xs text-slate-400">
          IR: {chip.irLength}bit | Pins: {chip.pins.length}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      className={`relative p-6 rounded-xl border transition-all duration-300 cursor-pointer
        ${isSelected 
          ? 'border-cyan-500 bg-gradient-to-br from-cyan-500/10 to-slate-800/80 shadow-xl shadow-cyan-500/10' 
          : 'border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800/70'
        }
      `}
    >
      {showRemove && (
        <button
          onClick={handleRemove}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-red-500/20 
                     text-slate-400 hover:text-red-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex items-start gap-4 mb-4">
        <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
          <Cpu className="w-8 h-8 text-cyan-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-slate-100 font-mono tracking-tight">
            {chip.name}
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            <FileCode className="inline w-3 h-3 mr-1" />
            {chip.fileName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InfoItem 
          icon={<Ruler className="w-4 h-4" />} 
          label="IR Length" 
          value={`${chip.irLength} bits`}
          color="cyan"
        />
        <InfoItem 
          icon={<Pin className="w-4 h-4" />} 
          label="Pins" 
          value={`${chip.pins.length}`}
          color="emerald"
        />
        <InfoItem 
          icon={<Hash className="w-4 h-4" />} 
          label="BS Cells" 
          value={`${chip.boundaryCells.length}`}
          color="amber"
        />
        {chip.idcode && (
          <InfoItem 
            icon={<FileCode className="w-4 h-4" />} 
            label="IDCODE" 
            value={chip.idcode}
            color="violet"
            mono
          />
        )}
        {chip.package && (
          <InfoItem 
            icon={<Package className="w-4 h-4" />} 
            label="Package" 
            value={chip.package}
            color="pink"
          />
        )}
        {chip.manufacturer && (
          <InfoItem 
            icon={<Factory className="w-4 h-4" />} 
            label="Manufacturer" 
            value={chip.manufacturer}
            color="sky"
          />
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          <span>
            Parsed: {new Date(chip.parsedAt).toLocaleDateString()}
          </span>
        </div>
        {isSelected && (
          <span className="text-xs text-cyan-400 font-medium">
            已选中
          </span>
        )}
      </div>
    </div>
  );
};

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'cyan' | 'emerald' | 'amber' | 'violet' | 'pink' | 'sky';
  mono?: boolean;
}

const InfoItem: React.FC<InfoItemProps> = ({ icon, label, value, color, mono }) => {
  const colorClasses: Record<string, string> = {
    cyan: 'text-cyan-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    violet: 'text-violet-400',
    pink: 'text-pink-400',
    sky: 'text-sky-400'
  };

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/50">
      <span className={colorClasses[color]}>{icon}</span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`text-sm font-medium text-slate-200 ${mono ? 'font-mono' : ''}`}>
          {value}
        </p>
      </div>
    </div>
  );
};

export const ChipList: React.FC = () => {
  const { chips, selectedChipId, selectChip } = useBSDLStore();

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-slate-400">
        已解析的芯片 ({chips.length})
      </h4>
      <div className="grid gap-3">
        {chips.map(chip => (
          <ChipInfoCard
            key={chip.id}
            chip={chip}
            isSelected={selectedChipId === chip.id}
            onSelect={() => selectChip(chip.id)}
            showRemove
            compact
          />
        ))}
      </div>
    </div>
  );
};
