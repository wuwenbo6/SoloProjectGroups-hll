import { useState, useEffect } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import { useMapStore } from '@/store/mapStore';
import { api } from '@/services/api';
import { Region } from '@/types';

export function RegionSelector() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { selectedRegion, setSelectedRegion, setSelectedYear } = useMapStore();

  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const data = await api.getRegions();
        setRegions(data);
        if (data.length > 0 && !selectedRegion) {
          setSelectedRegion(data[0]);
          setSelectedYear(data[0].availableYears[data[0].availableYears.length - 1]);
        }
      } catch (error) {
        console.error('Failed to fetch regions:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRegions();
  }, []);

  const handleSelect = (region: Region) => {
    setSelectedRegion(region);
    setSelectedYear(region.availableYears[region.availableYears.length - 1]);
    setIsOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-600">加载中...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 border border-gray-100"
      >
        <MapPin className="w-5 h-5 text-blue-600" />
        <span className="font-medium text-gray-800">
          {selectedRegion?.name || '选择地区'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-56 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50">
          {regions.map((region) => (
            <button
              key={region.id}
              onClick={() => handleSelect(region)}
              className={`w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors flex items-center justify-between ${
                selectedRegion?.id === region.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
              }`}
            >
              <span className="font-medium">{region.name}</span>
              <span className="text-xs text-gray-400">
                {region.availableYears.length}年数据
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
