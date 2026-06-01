import { useEffect } from 'react';
import { MapView } from '@/components/MapView';
import { RegionSelector } from '@/components/RegionSelector';
import { TimelineController } from '@/components/TimelineController';
import { LegendPanel } from '@/components/LegendPanel';
import { RoadTypeFilter } from '@/components/RoadTypeFilter';
import { ExportButton } from '@/components/ExportButton';
import { useMapStore } from '@/store/mapStore';
import { api } from '@/services/api';

export default function Home() {
  const { selectedRegion, selectedYear, setRoadData, roadData, filterTypes } = useMapStore();

  useEffect(() => {
    const fetchRoadData = async () => {
      if (selectedRegion) {
        try {
          const data = await api.getRoads(selectedRegion.id, selectedYear);
          setRoadData(data);
        } catch (error) {
          console.error('Failed to fetch road data:', error);
        }
      }
    };
    fetchRoadData();
  }, [selectedRegion, selectedYear, setRoadData]);

  const visibleRoads = roadData?.features.filter(
    (f) => filterTypes.includes('all') || filterTypes.includes(f.properties.highwayType as any)
  );

  const totalLength = visibleRoads?.reduce((sum, f) => sum + f.properties.length, 0) || 0;

  return (
    <div className="h-[calc(100vh-64px)] relative">
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-3">
        <RegionSelector />
        <RoadTypeFilter />
      </div>

      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-3">
        <ExportButton />
      </div>

      <LegendPanel />
      <MapView />
      <TimelineController />

      <div className="absolute bottom-28 left-4 z-[1000] flex flex-col gap-2">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-4 py-3 text-sm shadow-lg">
          <div className="text-gray-500 mb-1">当前显示</div>
          <div className="font-semibold text-gray-900">
            {visibleRoads?.length || 0} 条道路
          </div>
          <div className="text-blue-600 font-medium">
            {(totalLength / 1000).toFixed(2)} km
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-gray-500">
          数据来源: OpenStreetMap
        </div>
      </div>
    </div>
  );
}
