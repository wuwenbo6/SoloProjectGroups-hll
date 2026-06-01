import { create } from 'zustand';
import { Region, RoadFeatureCollection, MapState, HighwayType } from '@/types';

interface MapStore extends MapState {
  setSelectedRegion: (region: Region | null) => void;
  setSelectedYear: (year: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setRoadData: (data: RoadFeatureCollection | null) => void;
  toggleFilterType: (type: HighwayType) => void;
  setFilterTypes: (types: HighwayType[]) => void;
  reset: () => void;
}

export const useMapStore = create<MapStore>((set) => ({
  selectedRegion: null,
  selectedYear: 2024,
  isPlaying: false,
  roadData: null,
  filterTypes: ['all'],
  setSelectedRegion: (region) => set({ selectedRegion: region }),
  setSelectedYear: (year) => set({ selectedYear: year }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setRoadData: (data) => set({ roadData: data }),
  toggleFilterType: (type) => set((state) => {
    if (type === 'all') {
      return { filterTypes: ['all'] };
    }
    const currentFilters = state.filterTypes.filter(t => t !== 'all');
    const newFilters = currentFilters.includes(type)
      ? currentFilters.filter(t => t !== type)
      : [...currentFilters, type];
    return {
      filterTypes: newFilters.length === 0 ? ['all'] : newFilters
    };
  }),
  setFilterTypes: (types) => set({ filterTypes: types }),
  reset: () => set({
    selectedRegion: null,
    selectedYear: 2024,
    isPlaying: false,
    roadData: null,
    filterTypes: ['all'],
  }),
}));
