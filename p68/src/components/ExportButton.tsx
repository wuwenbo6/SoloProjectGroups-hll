import { Download } from 'lucide-react';
import { useMapStore } from '@/store/mapStore';

export function ExportButton() {
  const { roadData, selectedRegion, selectedYear, filterTypes } = useMapStore();

  const handleExport = () => {
    if (!roadData || !selectedRegion) return;

    const exportData = {
      type: 'FeatureCollection',
      metadata: {
        region: selectedRegion.name,
        regionId: selectedRegion.id,
        year: selectedYear,
        filterTypes: filterTypes,
        exportTime: new Date().toISOString(),
      },
      features: roadData.features,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedRegion.id}_${selectedYear}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      disabled={!roadData || roadData.features.length === 0}
      className="flex items-center gap-2 px-4 py-2.5 bg-white/95 backdrop-blur-sm text-gray-700 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 border border-gray-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
    >
      <Download className="w-5 h-5 text-blue-600" />
      <span className="text-sm font-medium">导出GeoJSON</span>
    </button>
  );
}
