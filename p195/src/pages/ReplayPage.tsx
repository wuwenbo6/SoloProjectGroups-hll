import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import { Play, Pause, RotateCcw, Gauge, SkipBack, SkipForward } from 'lucide-react';
import L from 'leaflet';
import { TrajectoryMessage } from '@/types';
import { formatLat, formatLon } from '@/utils/coordinate';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const CENTER: [number, number] = [39.9, 116.4];

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function AutoPanToCurrent({ currentMsg }: { currentMsg: TrajectoryMessage | null }) {
  const map = useMap();
  useEffect(() => {
    if (currentMsg) {
      map.panTo([currentMsg.ekf.lat, currentMsg.ekf.lon], {
        animate: true,
        duration: 0.3,
      });
    }
  }, [currentMsg, map]);
  return null;
}

export default function ReplayPage() {
  const [history, setHistory] = useState<TrajectoryMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/history');
        const data = await res.json();
        setHistory(data);
        setLoading(false);
      } catch (e) {
        console.error('Failed to fetch history:', e);
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  useEffect(() => {
    if (!isPlaying || history.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= history.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + speed;
      });
    }, 50 / speed);
    return () => clearInterval(interval);
  }, [isPlaying, history.length, speed]);

  const currentMsg = history[Math.min(currentIndex, history.length - 1)];

  const ekfPath: [number, number][] = history.slice(0, currentIndex + 1).map((m) => [m.ekf.lat, m.ekf.lon]);
  const rtkPoints: [number, number][] = history.slice(0, currentIndex + 1).filter((_, i) => i % 5 === 0).map((m) => [m.rtk.lat, m.rtk.lon]);

  const progress = history.length > 0 ? (currentIndex / (history.length - 1)) * 100 : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setCurrentIndex(Math.floor(ratio * (history.length - 1)));
  };

  return (
    <div className="w-screen h-screen relative bg-bg-primary grid-pattern noise-overlay overflow-hidden">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <div className="glass-panel rounded-full px-6 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-accent" />
            <span className="text-base font-bold bg-gradient-to-r from-accent to-imu bg-clip-text text-transparent">
              历史轨迹回放
            </span>
          </div>
          <div className="h-4 w-px bg-accent/20" />
          <span className="text-xs text-text-secondary font-mono">
            {loading ? '加载中...' : `${history.length} 个数据点`}
          </span>
        </div>
      </div>

      <div className="w-full h-full">
        <MapContainer
          center={CENTER}
          zoom={13}
          className="w-full h-full z-0"
          zoomControl={true}
        >
          <TileLayer
            attribution={TILE_ATTRIBUTION}
            url={TILE_URL}
            maxZoom={19}
          />
          <AutoPanToCurrent currentMsg={currentMsg} />

          {ekfPath.length > 1 && ekfPath.slice(0, -1).map((_, i) => {
            const ratio = i / Math.max(1, ekfPath.length - 1);
            const g = Math.round(255 * (1 - ratio) + 200 * ratio);
            const b = Math.round(200 * (1 - ratio) + 77 * ratio);
            return (
              <Polyline
                key={`replay-line-${i}`}
                positions={[ekfPath[i], ekfPath[i + 1]]}
                pathOptions={{
                  color: `rgb(0, ${g}, ${b})`,
                  weight: 3,
                  opacity: 0.9,
                }}
              />
            );
          })}

          {rtkPoints.map((pos, i) => (
            <CircleMarker
              key={`replay-rtk-${i}`}
              center={pos}
              radius={3}
              pathOptions={{
                color: '#ff6b35',
                fillColor: '#ff6b35',
                fillOpacity: 0.4,
                weight: 1,
              }}
            />
          ))}

          {currentMsg && (
            <CircleMarker
              center={[currentMsg.ekf.lat, currentMsg.ekf.lon]}
              radius={7}
              pathOptions={{
                color: '#00ffc8',
                fillColor: '#00ffc8',
                fillOpacity: 1,
                weight: 3,
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="absolute left-4 right-4 bottom-4 z-20">
        <div className="glass-panel rounded-2xl p-4">
          {currentMsg && (
            <div className="flex items-center justify-between mb-3 text-xs font-mono">
              <div className="flex items-center gap-4">
                <span className="text-text-dim">时间</span>
                <span className="text-accent">{currentMsg.timestamp.toFixed(1)}s</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-text-dim">纬度</span>
                <span className="text-text-primary">{formatLat(currentMsg.ekf.lat)}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-text-dim">经度</span>
                <span className="text-text-primary">{formatLon(currentMsg.ekf.lon)}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-text-dim">速度</span>
                <span className="text-imu">{Math.sqrt(currentMsg.ekf.vel_n ** 2 + currentMsg.ekf.vel_e ** 2).toFixed(2)} m/s</span>
              </div>
            </div>
          )}

          <div
            className="h-2 bg-bg-tertiary rounded-full cursor-pointer mb-3 overflow-hidden"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-gradient-to-r from-accent to-imu rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 10))}
              className="p-2 rounded-full hover:bg-accent/10 text-text-secondary hover:text-accent transition-all"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={history.length === 0}
              className="p-3 rounded-full bg-accent/20 hover:bg-accent/30 text-accent transition-all btn-glow disabled:opacity-50"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>

            <button
              onClick={() => setCurrentIndex(Math.min(history.length - 1, currentIndex + 10))}
              className="p-2 rounded-full hover:bg-accent/10 text-text-secondary hover:text-accent transition-all"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <div className="w-px h-6 bg-accent/20 mx-2" />

            <div className="flex items-center gap-1">
              {[0.5, 1, 2, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    speed === s
                      ? 'bg-accent text-bg-primary'
                      : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-accent/20 mx-2" />

            <button
              onClick={() => {
                setCurrentIndex(0);
                setIsPlaying(false);
              }}
              className="p-2 rounded-full hover:bg-red-500/10 text-text-secondary hover:text-red-400 transition-all"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            <div className="ml-4 text-xs font-mono text-text-dim">
              {Math.min(currentIndex, history.length - 1)} / {Math.max(0, history.length - 1)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
