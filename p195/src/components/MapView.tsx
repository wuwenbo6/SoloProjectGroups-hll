import { MapContainer, TileLayer, Polyline, CircleMarker, Circle, Popup, useMap } from 'react-leaflet';
import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { useAppStore } from '@/store';
import { formatLat, formatLon, getCovarianceEllipse } from '@/utils/coordinate';
import { TrajectoryMessage } from '@/types';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const CENTER: [number, number] = [39.9, 116.4];
const ZOOM = 13;

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface AutoPanProps {
  overrideMessage: TrajectoryMessage | null;
}

function AutoPan({ overrideMessage }: AutoPanProps) {
  const map = useMap();
  const currentMessage = useAppStore((s) => s.currentMessage);
  const msg = overrideMessage ?? currentMessage;

  useEffect(() => {
    if (msg) {
      map.panTo([msg.ekf.lat, msg.ekf.lon], {
        animate: true,
        duration: 0.3,
      });
    }
  }, [msg, map]);

  return null;
}

interface MapViewProps {
  overrideMessage?: TrajectoryMessage | null;
}

export function MapView({ overrideMessage = null }: MapViewProps) {
  const trajectoryHistory = useAppStore((s) => s.trajectoryHistory);
  const currentMessage = useAppStore((s) => s.currentMessage);
  const displayMessage = overrideMessage ?? currentMessage;

  const ekfPath: [number, number][] = trajectoryHistory.map((m) => [m.ekf.lat, m.ekf.lon]);

  const gradientOptions = useMemo(() => {
    if (ekfPath.length <= 1) return ['#00ffc8'];
    return ekfPath.map((_, i) => {
      const ratio = i / Math.max(1, ekfPath.length - 1);
      const g = Math.round(255 * (1 - ratio) + 200 * ratio);
      const b = Math.round(200 * (1 - ratio) + 77 * ratio);
      return `rgb(0, ${g}, ${b})`;
    });
  }, [ekfPath]);

  const covarianceDisplay = displayMessage
    ? getCovarianceEllipse(displayMessage.ekf.lat, displayMessage.ekf.lon, displayMessage.ekf.pos_covariance)
    : { latDelta: 0, lonDelta: 0 };

  return (
    <MapContainer
      center={CENTER}
      zoom={ZOOM}
      className="w-full h-full z-0"
      zoomControl={true}
    >
      <TileLayer
        attribution={TILE_ATTRIBUTION}
        url={TILE_URL}
        maxZoom={19}
      />
      <AutoPan overrideMessage={overrideMessage} />

      {ekfPath.length > 1 && ekfPath.slice(0, -1).map((_, i) => (
        <Polyline
          key={`ekf-line-${i}`}
          positions={[ekfPath[i], ekfPath[i + 1]]}
          pathOptions={{
            color: gradientOptions[i] || '#00ffc8',
            weight: 3,
            opacity: 0.9,
          }}
        />
      ))}

      {trajectoryHistory.filter((_, i) => i % 20 === 0).map((msg, idx) => {
        const i = idx * 20;
        if (msg.rtk.is_lost) return null;
        return (
          <CircleMarker
            key={`rtk-${i}`}
            center={[msg.rtk.lat, msg.rtk.lon]}
            radius={4}
            pathOptions={{
              color: '#ff6b35',
              fillColor: '#ff6b35',
              fillOpacity: 0.6,
              weight: 1,
            }}
          >
            <Popup>
              <div className="text-xs font-mono">
                <div className="text-rtk font-bold mb-1">RTK 测量点</div>
                <div>Lat: {formatLat(msg.rtk.lat)}</div>
                <div>Lon: {formatLon(msg.rtk.lon)}</div>
                <div>精度: {msg.rtk.accuracy.toFixed(3)}m</div>
                <div>时间: {msg.timestamp.toFixed(1)}s</div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {displayMessage && (
        <>
          <Circle
            center={[displayMessage.ekf.lat, displayMessage.ekf.lon]}
            radius={5}
            pathOptions={{
              color: '#00ffc8',
              fillColor: '#00ffc8',
              fillOpacity: 1,
              weight: 2,
            }}
            className="animate-glow"
          >
            <Popup>
              <div className="text-xs font-mono">
                <div className="text-accent font-bold mb-1">EKF 融合位置</div>
                <div>Lat: {formatLat(displayMessage.ekf.lat)}</div>
                <div>Lon: {formatLon(displayMessage.ekf.lon)}</div>
                <div>高度: {displayMessage.ekf.alt.toFixed(2)}m</div>
                <div>速度: {Math.sqrt(displayMessage.ekf.vel_n ** 2 + displayMessage.ekf.vel_e ** 2).toFixed(2)} m/s</div>
                <div>航向: {(displayMessage.ekf.yaw * 180 / Math.PI).toFixed(1)}°</div>
                <div>时间: {displayMessage.timestamp.toFixed(1)}s</div>
              </div>
            </Popup>
          </Circle>

          {covarianceDisplay.latDelta > 0 && covarianceDisplay.lonDelta > 0 && (
            <Circle
              center={[displayMessage.ekf.lat, displayMessage.ekf.lon]}
              radius={Math.max(covarianceDisplay.latDelta * 111319.9, covarianceDisplay.lonDelta * 111319.9 * Math.cos(displayMessage.ekf.lat * Math.PI / 180))}
              pathOptions={{
                color: 'rgba(0, 255, 200, 0.5)',
                fillColor: 'rgba(0, 255, 200, 0.1)',
                fillOpacity: 0.3,
                weight: 1,
                dashArray: '5, 5',
              }}
            />
          )}
        </>
      )}
    </MapContainer>
  );
}
