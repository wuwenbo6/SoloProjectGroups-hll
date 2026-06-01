import { useState, useRef, useEffect, useCallback } from 'react';
import { MapView } from '@/components/MapView';
import { SensorPanel } from '@/components/SensorPanel';
import { EkfPanel } from '@/components/EkfPanel';
import { MagCalibrationPanel } from '@/components/MagCalibrationPanel';
import { ControlBar } from '@/components/ControlBar';
import { useAppStore } from '@/store';
import {
  Cpu,
  Activity,
  Map,
  Compass,
  SignalZero,
  Play,
  Pause,
  Download,
  SkipBack,
  SkipForward,
  RefreshCcw,
} from 'lucide-react';
import { TrajectoryMessage } from '@/types';

type LeftPanel = 'imu' | 'mag';
type PlaybackMode = 'live' | 'replay';

export default function TrajectoryPage() {
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('imu');
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('live');
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [displayMessage, setDisplayMessage] = useState<TrajectoryMessage | null>(null);
  const trajectoryHistory = useAppStore((s) => s.trajectoryHistory);
  const currentMessage = useAppStore((s) => s.currentMessage);
  const replayTimerRef = useRef<number | null>(null);

  const rtkLost = playbackMode === 'live'
    ? currentMessage?.ekf.rtk_lost
    : displayMessage?.ekf.rtk_lost;

  useEffect(() => {
    if (playbackMode === 'live') {
      setDisplayMessage(currentMessage);
    }
  }, [currentMessage, playbackMode]);

  useEffect(() => {
    if (playbackMode === 'live') {
      if (isReplaying) {
        setIsReplaying(false);
      }
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    }
  }, [playbackMode]);

  useEffect(() => {
    if (!isReplaying || playbackMode !== 'replay' || trajectoryHistory.length === 0) {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
      return;
    }

    const interval = 50 / replaySpeed;
    replayTimerRef.current = window.setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= trajectoryHistory.length - 1) {
          setIsReplaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, interval);

    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  }, [isReplaying, playbackMode, replaySpeed, trajectoryHistory.length]);

  useEffect(() => {
    if (playbackMode === 'replay' && trajectoryHistory[replayIndex]) {
      setDisplayMessage(trajectoryHistory[replayIndex]);
    }
  }, [replayIndex, playbackMode, trajectoryHistory]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (trajectoryHistory.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newIndex = Math.floor(ratio * (trajectoryHistory.length - 1));
    setReplayIndex(newIndex);
    setDisplayMessage(trajectoryHistory[newIndex]);
  }, [trajectoryHistory]);

  const handleExportKML = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/export/kml');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trajectory_${new Date().toISOString().slice(0, 10)}.kml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('KML export failed:', e);
    }
  };

  const progress = trajectoryHistory.length > 0
    ? (replayIndex / (trajectoryHistory.length - 1)) * 100
    : 0;

  return (
    <div className="w-screen h-screen relative bg-bg-primary grid-pattern noise-overlay overflow-hidden">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <div className="glass-panel rounded-full px-6 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-accent" />
            <span className="text-base font-bold bg-gradient-to-r from-accent to-imu bg-clip-text text-transparent">
              IMU-RTK EKF 传感器融合系统
            </span>
          </div>
          <div className="h-4 w-px bg-accent/20" />
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Map className="w-3.5 h-3.5" />
            <span>实时轨迹</span>
          </div>
          <div className="h-4 w-px bg-accent/20" />
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Activity className="w-3.5 h-3.5" />
            <span>20Hz</span>
          </div>
          {rtkLost && (
            <>
              <div className="h-4 w-px bg-red-500/30" />
              <div className="flex items-center gap-1.5 text-xs text-red-400 animate-pulse-slow">
                <SignalZero className="w-3.5 h-3.5" />
                <span>RTK 丢失 · 纯惯性</span>
              </div>
            </>
          )}
          <div className="h-4 w-px bg-accent/20" />
          <button
            onClick={handleExportKML}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 hover:bg-accent/20 text-accent text-xs font-medium transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出 KML</span>
          </button>
        </div>
      </div>

      <div className="absolute top-0 left-0 w-72 h-full z-10 p-4 pt-16">
        <div className="glass-panel rounded-xl h-full overflow-hidden flex flex-col">
          <div className="flex border-b border-accent/10">
            <button
              onClick={() => setLeftPanel('imu')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-all ${
                leftPanel === 'imu'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-dim hover:text-text-secondary'
              }`}
            >
              IMU 传感器
            </button>
            <button
              onClick={() => setLeftPanel('mag')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-all ${
                leftPanel === 'mag'
                  ? 'text-rtk border-b-2 border-rtk'
                  : 'text-text-dim hover:text-text-secondary'
              }`}
            >
              磁力计校准
            </button>
          </div>
          <div className="flex-1 min-h-0">
            {leftPanel === 'imu' ? <SensorPanel overrideMessage={displayMessage} /> : <MagCalibrationPanel />}
          </div>
        </div>
      </div>

      <div className="absolute top-0 right-0 w-80 h-full z-10 p-4 pt-16">
        <div className="glass-panel rounded-xl h-full overflow-y-auto">
          <EkfPanel overrideMessage={displayMessage} />
        </div>
      </div>

      <div className="w-full h-full">
        <MapView overrideMessage={displayMessage} />
      </div>

      <ControlBar />

      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4">
        <div className="glass-panel rounded-2xl p-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPlaybackMode('live')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  playbackMode === 'live'
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-bg-tertiary/50 text-text-dim hover:text-text-secondary'
                }`}
              >
                实时模式
              </button>
              <button
                onClick={() => {
                  setPlaybackMode('replay');
                  setReplayIndex(trajectoryHistory.length - 1);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  playbackMode === 'replay'
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-bg-tertiary/50 text-text-dim hover:text-text-secondary'
                }`}
                disabled={trajectoryHistory.length === 0}
              >
                回放模式
              </button>
            </div>

            <div className="h-4 w-px bg-accent/20" />

            {playbackMode === 'replay' && (
              <>
                <button
                  onClick={() => setReplayIndex(Math.max(0, replayIndex - 20))}
                  className="p-1.5 rounded-full hover:bg-accent/10 text-text-dim hover:text-accent transition-all"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsReplaying(!isReplaying)}
                  disabled={trajectoryHistory.length === 0}
                  className="p-2 rounded-full bg-accent/20 hover:bg-accent/30 text-accent transition-all disabled:opacity-50"
                >
                  {isReplaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setReplayIndex(Math.min(trajectoryHistory.length - 1, replayIndex + 20))}
                  className="p-1.5 rounded-full hover:bg-accent/10 text-text-dim hover:text-accent transition-all"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <div className="h-4 w-px bg-accent/20" />

                <div className="flex items-center gap-1">
                  {[0.5, 1, 2, 4].map((s) => (
                    <button
                      key={s}
                      onClick={() => setReplaySpeed(s)}
                      className={`px-2 py-1 rounded-full text-[10px] font-medium transition-all ${
                        replaySpeed === s
                          ? 'bg-accent text-bg-primary'
                          : 'bg-bg-tertiary text-text-dim hover:text-text-secondary'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>

                <div className="h-4 w-px bg-accent/20" />

                <button
                  onClick={() => {
                    setReplayIndex(0);
                    setIsReplaying(false);
                  }}
                  className="p-1.5 rounded-full hover:bg-red-500/10 text-text-dim hover:text-red-400 transition-all"
                >
                  <RefreshCcw className="w-4 h-4" />
                </button>
              </>
            )}

            <div className="ml-auto text-[10px] font-mono text-text-dim">
              {playbackMode === 'live' ? (
                `实时 · ${trajectoryHistory.length} 帧`
              ) : (
                `回放 ${Math.min(replayIndex, trajectoryHistory.length - 1)} / ${Math.max(0, trajectoryHistory.length - 1)}`
              )}
            </div>
          </div>

          <div
            className="h-2 bg-bg-tertiary rounded-full cursor-pointer overflow-hidden relative"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-gradient-to-r from-accent to-imu rounded-full transition-all"
              style={{
                width: playbackMode === 'live'
                  ? trajectoryHistory.length > 0 ? '100%' : '0%'
                  : `${progress}%`,
              }}
            />
            {playbackMode === 'replay' && trajectoryHistory.length > 0 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent shadow-lg"
                style={{ left: `calc(${progress}% - 6px)` }}
              />
            )}
          </div>

          {displayMessage && (
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-text-dim">
              <span>t = {displayMessage.timestamp.toFixed(1)}s</span>
              <span>
                速度: {Math.sqrt(displayMessage.ekf.vel_n ** 2 + displayMessage.ekf.vel_e ** 2).toFixed(1)} m/s
              </span>
              <span>
                置信度: {(displayMessage.ekf.confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-[336px] z-20">
        <div className="glass-panel rounded-full px-4 py-2 text-[10px] font-mono text-text-dim flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${rtkLost ? 'bg-red-500 animate-pulse-slow' : 'bg-rtk animate-pulse-slow'}`} />
          <span>RTK</span>
          <span className="w-1 h-1 rounded-full bg-text-dim" />
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span>EKF</span>
          <span className="w-1 h-1 rounded-full bg-text-dim" />
          <span className="w-2 h-2 rounded-full bg-imu" />
          <span>IMU</span>
          <span className="w-1 h-1 rounded-full bg-text-dim" />
          <Compass className="w-2 h-2 text-rtk" />
          <span>Mag</span>
        </div>
      </div>
    </div>
  );
}
