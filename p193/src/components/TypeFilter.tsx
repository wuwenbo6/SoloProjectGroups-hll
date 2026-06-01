import { useAppStore, useStats } from '../store/useAppStore';
import { getPacketTypeColor } from '../utils/formatters';

const FILTERS = [
  { type: null, label: 'All' },
  { type: 1, label: 'TMATS' },
  { type: 2, label: 'PCM' },
  { type: 7, label: '1553 Bus' }
];

export function TypeFilter() {
  const { activeFilter, setActiveFilter } = useAppStore();
  const stats = useStats();

  const getCountForType = (type: number | null): number => {
    if (type === null) return stats.total;
    if (type === 1) return stats.tmats;
    if (type === 2) return stats.pcm;
    if (type === 7) return stats.mil1553;
    return 0;
  };

  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((filter) => {
        const count = getCountForType(filter.type);
        const isActive = activeFilter === filter.type;
        const typeColor = filter.type !== null ? getPacketTypeColor(filter.type) : '';
        
        return (
          <button
            key={filter.type ?? 'all'}
            onClick={() => setActiveFilter(isActive ? null : filter.type)}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
              border flex items-center gap-2
              ${isActive 
                ? typeColor || 'bg-slate-600 text-slate-100 border-slate-500'
                : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-300'
              }
            `}
          >
            <span>{filter.label}</span>
            <span className={`
              px-1.5 py-0.5 text-xs rounded-full font-mono
              ${isActive 
                ? 'bg-white/20 text-white' 
                : 'bg-slate-700 text-slate-500'
              }
            `}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
