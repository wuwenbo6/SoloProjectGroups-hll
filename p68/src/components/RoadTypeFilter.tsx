import { Filter, X } from 'lucide-react';
import { useMapStore } from '@/store/mapStore';
import { HighwayType } from '@/types';
import { highwayTypeLabels } from '@/services/mockData';

const allFilterTypes: HighwayType[] = ['all', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential'];

export function RoadTypeFilter() {
  const { filterTypes: selectedFilters, toggleFilterType } = useMapStore();

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <Filter className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-gray-800">道路类型过滤</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {allFilterTypes.map((type) => (
          <button
            key={type}
            onClick={() => toggleFilterType(type)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              selectedFilters.includes(type)
                ? type === 'all'
                  ? 'bg-blue-600 text-white'
                  : type === 'motorway'
                  ? 'bg-purple-100 text-purple-700 border border-purple-300'
                  : type === 'trunk'
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : type === 'primary'
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : type === 'secondary'
                  ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                  : type === 'tertiary'
                  ? 'bg-orange-100 text-orange-700 border border-orange-300'
                  : 'bg-gray-100 text-gray-700 border border-gray-300'
                : 'bg-gray-50 text-gray-400 border border-gray-200'
            }`}
          >
            <span className="flex items-center gap-1">
              {selectedFilters.includes(type) && type !== 'all' && (
                <X className="w-3 h-3" />
              )}
              {highwayTypeLabels[type]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
