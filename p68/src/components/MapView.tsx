import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapStore } from '@/store/mapStore';
import { RoadFeature, RoadFeatureCollection } from '@/types';

const getRoadColor = (status: string): string => {
  switch (status) {
    case 'new':
      return '#00B42A';
    case 'disappeared':
      return '#F53F3F';
    default:
      return '#165DFF';
  }
};

const getRoadWeight = (highwayType: string): number => {
  switch (highwayType) {
    case 'motorway':
      return 5;
    case 'trunk':
      return 4;
    case 'primary':
      return 3;
    case 'secondary':
      return 2;
    default:
      return 1.5;
  }
};

function MapBoundsController() {
  const map = useMap();
  const { selectedRegion } = useMapStore();

  useEffect(() => {
    if (selectedRegion) {
      const [minLon, minLat, maxLon, maxLat] = selectedRegion.bbox;
      const bounds = L.latLngBounds(
        L.latLng(minLat, minLon),
        L.latLng(maxLat, maxLon)
      );
      map.fitBounds(bounds, { padding: [50, 50], animate: true, duration: 0.5 });
    }
  }, [selectedRegion, map]);

  return null;
}

function RoadLayer({ data }: { data: RoadFeatureCollection | null }) {
  const geoJsonRef = useRef<L.GeoJSON | null>(null);
  const prevDataRef = useRef<RoadFeatureCollection | null>(null);
  const { filterTypes } = useMapStore();

  const filteredData = useMemo(() => {
    if (!data) return null;
    if (filterTypes.includes('all')) return data;
    return {
      ...data,
      features: data.features.filter((f) =>
        filterTypes.includes(f.properties.highwayType as any)
      ),
    };
  }, [data, filterTypes]);

  const geoJsonStyle = (feature: RoadFeature) => {
    return {
      color: getRoadColor(feature.properties.status),
      weight: getRoadWeight(feature.properties.highwayType),
      opacity: 0.85,
      lineCap: 'round' as const,
      lineJoin: 'round' as const,
    };
  };

  const onEachFeature = (feature: RoadFeature, layer: L.Path) => {
    const props = feature.properties;
    const popupContent = `
      <div class="p-2">
        <h3 class="font-semibold text-gray-900">${props.name || '未命名道路'}</h3>
        <p class="text-sm text-gray-600">类型: ${props.highwayType}</p>
        <p class="text-sm text-gray-600">长度: ${(props.length / 1000).toFixed(2)} km</p>
        <p class="text-sm text-gray-600">首次出现: ${props.firstSeen}年</p>
        <p class="text-sm text-gray-600">最后出现: ${props.lastSeen}年</p>
        <p class="text-sm font-medium" style="color: ${getRoadColor(props.status)}">
          状态: ${props.status === 'new' ? '新增' : props.status === 'disappeared' ? '消失' : '现有'}
        </p>
      </div>
    `;
    layer.bindPopup(popupContent);
  };

  useEffect(() => {
    if (!geoJsonRef.current || !filteredData) return;

    const currentIds = new Set(filteredData.features.map((f) => f.properties.id));
    const prevIds = new Set(prevDataRef.current?.features.map((f) => f.properties.id) || []);

    const layers = geoJsonRef.current.getLayers();
    const featuresToRemove: L.Layer[] = [];

    layers.forEach((layer: any) => {
      const feature = layer.feature;
      if (feature && !currentIds.has(feature.properties.id)) {
        featuresToRemove.push(layer);
      }
    });

    featuresToRemove.forEach((layer) => {
      if (geoJsonRef.current) {
        geoJsonRef.current.removeLayer(layer);
      }
    });

    const newFeatures = filteredData.features.filter((f) => !prevIds.has(f.properties.id));
    if (newFeatures.length > 0) {
      newFeatures.forEach((feature) => {
        if (geoJsonRef.current) {
          geoJsonRef.current.addData(feature as any);
        }
      });
    }

    layers.forEach((layer: any) => {
      const feature = layer.feature;
      if (feature && currentIds.has(feature.properties.id)) {
        const newFeature = filteredData.features.find(
          (f) => f.properties.id === feature.properties.id
        );
        if (newFeature) {
          layer.setStyle(geoJsonStyle(newFeature));
          layer.feature = newFeature;
          layer.unbindPopup();
          onEachFeature(newFeature, layer);
        }
      }
    });

    prevDataRef.current = filteredData;
  }, [filteredData]);

  if (!filteredData || filteredData.features.length === 0) {
    return null;
  }

  return (
    <GeoJSON
      ref={geoJsonRef as any}
      data={filteredData as unknown as GeoJSON.GeoJsonObject}
      style={geoJsonStyle as L.GeoJSONOptions['style']}
      onEachFeature={onEachFeature as L.GeoJSONOptions['onEachFeature']}
    />
  );
}

export function MapView() {
  const { roadData, selectedRegion } = useMapStore();

  const defaultCenter: [number, number] = useMemo(() => {
    if (selectedRegion) {
      const [minLon, minLat, maxLon, maxLat] = selectedRegion.bbox;
      return [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
    }
    return [39.9042, 116.4074];
  }, [selectedRegion]);

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        className="w-full h-full z-0"
        style={{ background: '#1a1a2e' }}
        zoomAnimation={true}
        fadeAnimation={true}
        markerZoomAnimation={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          maxZoom={19}
        />
        <MapBoundsController />
        <RoadLayer data={roadData} />
      </MapContainer>
    </div>
  );
}
