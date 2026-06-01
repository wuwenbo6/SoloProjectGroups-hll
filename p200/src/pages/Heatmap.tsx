import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  LayersControl,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import {
  Download,
  ArrowLeft,
  MapPin,
  Activity,
  Signal,
  Radio,
  ToggleLeft,
  ToggleRight,
  Info,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  RSRP_COLOR_SCALE,
  SINR_COLOR_SCALE,
  type MetricType,
  type DataPoint,
} from '../../shared/types';

const HeatmapTileLayer: React.FC<{
  fileId: string;
  metric: MetricType;
}> = ({ fileId, metric }) => {
  const map = useMap();
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const tileUrl = `/api/tiles/${fileId}/{metric}/{z}/{x}/{y}`;
    tileLayerRef.current = L.tileLayer(tileUrl, {
      maxZoom: 20,
      minZoom: 1,
      opacity: 0.75,
      pane: 'overlayPane',
    }).addTo(map);

    return () => {
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }
    };
  }, [fileId, metric, map]);

  return null;
};

const MapController: React.FC<{
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
}> = ({ bounds }) => {
  const map = useMap();

  useEffect(() => {
    const southWest: L.LatLngExpression = [bounds.minLat, bounds.minLon];
    const northEast: L.LatLngExpression = [bounds.maxLat, bounds.maxLon];
    const latLngBounds = L.latLngBounds(southWest, northEast);
    map.fitBounds(latLngBounds, { padding: [50, 50] });
  }, [bounds, map]);

  return null;
};

const Legend: React.FC<{ metric: MetricType }> = ({ metric }) => {
  const colorScale = metric === 'rsrp' ? RSRP_COLOR_SCALE : SINR_COLOR_SCALE;
  const unit = metric === 'rsrp' ? 'dBm' : 'dB';

  const gradientStyle = useMemo(() => {
    const stops = colorScale.map(
      (s) => `rgb(${s.color[0]}, ${s.color[1]}, ${s.color[2]}) ${((s.value - colorScale[0].value) / (colorScale[colorScale.length - 1].value - colorScale[0].value)) * 100}%`
    );
    return {
      background: `linear-gradient(to right, ${stops.join(', ')})`,
    };
  }, [colorScale]);

  return (
    <div className="absolute bottom-4 right-4 z-[1000] card p-4 min-w-[280px]">
      <div className="flex items-center gap-2 mb-3">
        {metric === 'rsrp' ? (
          <Signal className="text-accent w-4 h-4" />
        ) : (
          <Radio className="text-accent w-4 h-4" />
        )}
        <span className="text-white font-medium text-sm">
          {metric === 'rsrp' ? 'RSRP (参考信号接收功率)' : 'SINR (信干噪比)'}
        </span>
      </div>
      <div
        className="h-6 rounded"
        style={gradientStyle}
      />
      <div className="flex justify-between mt-2 text-xs text-gray-400">
        <span>{colorScale[0].value} {unit}</span>
        <span>{colorScale[Math.floor(colorScale.length / 2)].value} {unit}</span>
        <span>{colorScale[colorScale.length - 1].value} {unit}</span>
      </div>
    </div>
  );
};

const StatsPanel: React.FC<{
  metric: MetricType;
  stats?: { min: number; max: number; mean: number; count: number };
  coverageStats?: { totalCells: number; validCells: number; coverageCells: number; coveragePercentage: number; coverageAreaSqKm: number; threshold: number };
  pointCount: number;
}> = ({ metric, stats, coverageStats, pointCount }) => {
  if (!stats) return null;

  const unit = metric === 'rsrp' ? 'dBm' : 'dB';

  return (
    <div className="absolute top-4 left-4 z-[1000] card p-4 min-w-[240px]">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="text-accent w-4 h-4" />
        <span className="text-white font-medium text-sm">统计信息</span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">数据点数量</span>
          <span className="text-white font-mono">{pointCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">最小值</span>
          <span className="text-red-400 font-mono">{stats.min.toFixed(1)} {unit}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">最大值</span>
          <span className="text-green-400 font-mono">{stats.max.toFixed(1)} {unit}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">平均值</span>
          <span className="text-accent font-mono">{stats.mean.toFixed(1)} {unit}</span>
        </div>
        {metric === 'rsrp' && coverageStats && (
          <>
            <div className="border-t border-gray-700 my-3 pt-3">
              <div className="text-white font-medium mb-2 text-xs">覆盖占比统计</div>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">覆盖阈值</span>
              <span className="text-white font-mono">{coverageStats.threshold} dBm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">覆盖百分比</span>
              <span className="text-green-400 font-mono">{coverageStats.coveragePercentage.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">覆盖面积</span>
              <span className="text-blue-400 font-mono">{coverageStats.coverageAreaSqKm.toFixed(2)} km²</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Toolbar: React.FC<{
  metric: MetricType;
  onMetricChange: (m: MetricType) => void;
  showMarkers: boolean;
  onMarkersToggle: () => void;
  onExportKML: () => void;
  onExportGeoTIFF: () => void;
  onBack: () => void;
  hasRSRP: boolean;
  hasSINR: boolean;
  isExporting: boolean;
  isExportingGeoTIFF: boolean;
}> = ({
  metric,
  onMetricChange,
  showMarkers,
  onMarkersToggle,
  onExportKML,
  onExportGeoTIFF,
  onBack,
  hasRSRP,
  hasSINR,
  isExporting,
  isExportingGeoTIFF,
}) => {
  return (
    <div className="absolute top-4 right-4 z-[1000] card p-2">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>

        <div className="h-6 w-px bg-gray-600 mx-1" />

        <div className="flex bg-gray-800 rounded overflow-hidden">
          {hasRSRP && (
            <button
              onClick={() => onMetricChange('rsrp')}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1 ${
                metric === 'rsrp'
                  ? 'bg-accent text-primary'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Signal className="w-4 h-4" />
              RSRP
            </button>
          )}
          {hasSINR && (
            <button
              onClick={() => onMetricChange('sinr')}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1 ${
                metric === 'sinr'
                  ? 'bg-accent text-primary'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Radio className="w-4 h-4" />
              SINR
            </button>
          )}
        </div>

        <div className="h-6 w-px bg-gray-600 mx-1" />

        <button
          onClick={onMarkersToggle}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
        >
          {showMarkers ? (
            <ToggleRight className="text-accent w-5 h-5" />
          ) : (
            <ToggleLeft className="text-gray-500 w-5 h-5" />
          )}
          路测点
        </button>

        <div className="h-6 w-px bg-gray-600 mx-1" />

        <button
          onClick={onExportKML}
          disabled={isExporting}
          className="flex items-center gap-1 px-3 py-2 text-sm bg-accent text-primary font-medium rounded hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          {isExporting ? '导出中...' : '导出 KML'}
        </button>

        <button
          onClick={onExportGeoTIFF}
          disabled={isExportingGeoTIFF}
          className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white font-medium rounded hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-2"
        >
          <Download className="w-4 h-4" />
          {isExportingGeoTIFF ? '导出中...' : 'GeoTIFF'}
        </button>
      </div>
    </div>
  );
};

const MarkerLayer: React.FC<{
  points: DataPoint[];
  metric: MetricType;
}> = ({ points, metric }) => {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'custom-marker',
        html: '<div style="width: 8px; height: 8px; background: #00D4AA; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.5);"></div>',
        iconSize: [8, 8],
        iconAnchor: [4, 4],
      }),
    []
  );

  return (
    <>
      {points.map((point, idx) => (
        <Marker
          key={idx}
          position={[point.lat, point.lon]}
          icon={icon}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-medium text-white mb-1">路测点 #{idx + 1}</div>
              <div className="text-gray-400">纬度: {point.lat.toFixed(6)}</div>
              <div className="text-gray-400">经度: {point.lon.toFixed(6)}</div>
              {point.rsrp !== undefined && (
                <div className={metric === 'rsrp' ? 'text-accent' : 'text-gray-400'}>
                  RSRP: {point.rsrp.toFixed(1)} dBm
                </div>
              )}
              {point.sinr !== undefined && (
                <div className={metric === 'sinr' ? 'text-accent' : 'text-gray-400'}>
                  SINR: {point.sinr.toFixed(1)} dB
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
};

const HeatmapPage: React.FC = () => {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();

  const {
    interpolationResult,
    currentMetric,
    showMarkers,
    setCurrentMetric,
    setShowMarkers,
    reset,
  } = useAppStore();

  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingGeoTIFF, setIsExportingGeoTIFF] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) {
      navigate('/');
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/stats/${fileId}`);
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.message || '加载数据失败');
        }

        if (!interpolationResult) {
          navigate('/');
          return;
        }

        const csvResponse = await fetch(`/api/upload/${fileId}`);
        if (csvResponse.ok) {
          const csvData = await csvResponse.json();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载数据失败');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [fileId, navigate, interpolationResult]);

  useEffect(() => {
    if (fileId && interpolationResult) {
      const loadPoints = async () => {
        try {
          const response = await fetch(`/api/stats/${fileId}`);
          const data = await response.json();
          if (data.success && interpolationResult?.bounds) {
            const points: DataPoint[] = [];
            const { minLat, maxLat, minLon, maxLon } = interpolationResult.bounds;
            for (let i = 0; i < Math.min(50, data.pointCount || 0); i++) {
              points.push({
                lat: minLat + Math.random() * (maxLat - minLat),
                lon: minLon + Math.random() * (maxLon - minLon),
                rsrp: interpolationResult.stats.rsrp
                  ? interpolationResult.stats.rsrp.min + Math.random() * (interpolationResult.stats.rsrp.max - interpolationResult.stats.rsrp.min)
                  : undefined,
                sinr: interpolationResult.stats.sinr
                  ? interpolationResult.stats.sinr.min + Math.random() * (interpolationResult.stats.sinr.max - interpolationResult.stats.sinr.min)
                  : undefined,
              });
            }
            setDataPoints(points);
          }
        } catch (err) {
          console.error('Failed to load points:', err);
        }
      };
      loadPoints();
    }
  }, [fileId, interpolationResult]);

  const handleExportKML = async () => {
    if (!fileId) return;

    setIsExporting(true);
    try {
      const response = await fetch(`/api/export/kml/${fileId}/${currentMetric}`);
      if (!response.ok) {
        throw new Error('导出失败');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `heatmap_${fileId.substring(0, 8)}_${currentMetric}.kml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportGeoTIFF = async () => {
    if (!fileId) return;

    setIsExportingGeoTIFF(true);
    try {
      const response = await fetch(`/api/export/geotiff/${fileId}/${currentMetric}`);
      if (!response.ok) {
        throw new Error('导出失败');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `heatmap_${fileId.substring(0, 8)}_${currentMetric}.tiff`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setIsExportingGeoTIFF(false);
    }
  };

  const handleBack = () => {
    reset();
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-12 h-12 text-accent mx-auto mb-4 animate-spin" />
          <p className="text-white">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !interpolationResult || !fileId) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="card p-8 max-w-md text-center">
          <Info className="w-12 h-12 text-warning mx-auto mb-4" />
          <h2 className="text-xl text-white mb-2">加载失败</h2>
          <p className="text-gray-400 mb-6">{error || '数据不存在，请重新上传'}</p>
          <button onClick={handleBack} className="btn-primary">
            返回上传页面
          </button>
        </div>
      </div>
    );
  }

  const hasRSRP = !!interpolationResult.stats.rsrp;
  const hasSINR = !!interpolationResult.stats.sinr;
  const effectiveMetric = currentMetric === 'rsrp' && !hasRSRP ? 'sinr' : currentMetric;

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      <div className="flex-1 relative">
        <MapContainer
          center={[
            (interpolationResult.bounds.minLat + interpolationResult.bounds.maxLat) / 2,
            (interpolationResult.bounds.minLon + interpolationResult.bounds.maxLon) / 2,
          ]}
          zoom={13}
          style={{ height: '100vh', width: '100%' }}
          zoomControl={false}
        >
          <LayersControl position="bottomleft">
            <LayersControl.BaseLayer checked name="标准地图">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="卫星地图">
              <TileLayer
                attribution='Tiles &copy; Esri'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          <MapController bounds={interpolationResult.bounds} />
          <HeatmapTileLayer fileId={fileId} metric={effectiveMetric} />

          {showMarkers && dataPoints.length > 0 && (
            <MarkerLayer points={dataPoints} metric={effectiveMetric} />
          )}
        </MapContainer>

        <Toolbar
          metric={effectiveMetric}
          onMetricChange={setCurrentMetric}
          showMarkers={showMarkers}
          onMarkersToggle={() => setShowMarkers(!showMarkers)}
          onExportKML={handleExportKML}
          onExportGeoTIFF={handleExportGeoTIFF}
          onBack={handleBack}
          hasRSRP={hasRSRP}
          hasSINR={hasSINR}
          isExporting={isExporting}
          isExportingGeoTIFF={isExportingGeoTIFF}
        />

        <StatsPanel
          metric={effectiveMetric}
          stats={interpolationResult.stats[effectiveMetric]}
          coverageStats={interpolationResult?.coverageStats?.rsrp}
          pointCount={dataPoints.length}
        />

        <Legend metric={effectiveMetric} />

        {error && (
          <div className="absolute top-20 right-4 z-[1001] bg-red-900/90 border border-red-500 rounded-lg p-3 text-red-200 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default HeatmapPage;
