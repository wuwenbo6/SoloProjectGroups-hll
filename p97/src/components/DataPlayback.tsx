import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Gauge, Download, FileJson } from 'lucide-react';
import { EEGData } from '../hooks/useBluetooth';
import { DetectionResult } from '../hooks/useWebSocket';
import { EDFExporter } from '../utils/edfExporter';

interface DataPlaybackProps {
  eegData: EEGData[];
  detectionResults: DetectionResult[];
  onPlaybackData: (data: EEGData) => void;
  onSeek?: (index: number) => void;
}

export function DataPlayback({
  eegData,
  detectionResults,
  onPlaybackData,
  onSeek
}: DataPlaybackProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  const playbackIntervalRef = useRef<number | null>(null);
  const speedOptions = [0.25, 0.5, 1, 2, 4];

  useEffect(() => {
    if (isPlaying && currentIndex < eegData.length - 1) {
      const interval = Math.floor(1000 / (256 * playbackSpeed));
      
      playbackIntervalRef.current = window.setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= eegData.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          const next = prev + 1;
          const data = eegData[next];
          if (data) {
            onPlaybackData(data);
          }
          return next;
        });
      }, Math.max(interval, 4));
    }

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, eegData.length, onPlaybackData]);

  const handlePlayPause = () => {
    if (currentIndex >= eegData.length - 1) {
      setCurrentIndex(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleSkipBack = () => {
    const newIndex = Math.max(0, currentIndex - 256);
    setCurrentIndex(newIndex);
    if (onSeek) onSeek(newIndex);
  };

  const handleSkipForward = () => {
    const newIndex = Math.min(eegData.length - 1, currentIndex + 256);
    setCurrentIndex(newIndex);
    if (onSeek) onSeek(newIndex);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(e.target.value, 10);
    setCurrentIndex(newIndex);
    if (onSeek) onSeek(newIndex);
    const data = eegData[newIndex];
    if (data) {
      onPlaybackData(data);
    }
  };

  const formatTime = (index: number): string => {
    const seconds = index / 256;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getSeizureMarkers = (): number[] => {
    return detectionResults
      .filter((r, i) => r.isSeizure && i % 10 === 0)
      .map(r => detectionResults.indexOf(r));
  };

  const handleExportEDF = () => {
    EDFExporter.downloadEDF(eegData);
    setShowExportMenu(false);
  };

  const handleExportCSV = () => {
    EDFExporter.downloadCSV(eegData);
    setShowExportMenu(false);
  };

  const handleExportJSON = () => {
    const exportData = {
      eegData,
      detectionResults,
      metadata: {
        startTime: eegData[0]?.timestamp,
        endTime: eegData[eegData.length - 1]?.timestamp,
        sampleCount: eegData.length,
        samplingRate: 256
      }
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EEG_Recording_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const seizureMarkers = getSeizureMarkers();
  const progress = eegData.length > 0 ? (currentIndex / (eegData.length - 1)) * 100 : 0;

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FileJson className="w-5 h-5 text-blue-400" />
          数据回放分析
        </h3>
        
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={eegData.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            导出
          </button>
          
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-2 bg-slate-700 rounded-lg shadow-xl border border-slate-600 py-2 z-50 min-w-[140px]">
              <button
                onClick={handleExportEDF}
                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-600 transition-colors flex items-center gap-2"
              >
                <FileJson className="w-4 h-4" />
                EDF 格式
              </button>
              <button
                onClick={handleExportCSV}
                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-600 transition-colors flex items-center gap-2"
              >
                <FileJson className="w-4 h-4" />
                CSV 格式
              </button>
              <button
                onClick={handleExportJSON}
                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-600 transition-colors flex items-center gap-2"
              >
                <FileJson className="w-4 h-4" />
                JSON 格式
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <input
            type="range"
            min="0"
            max={Math.max(0, eegData.length - 1)}
            value={currentIndex}
            onChange={handleSeek}
            disabled={eegData.length === 0}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          
          {seizureMarkers.map((marker, i) => (
            <div
              key={i}
              className="absolute top-0 w-1 h-2 bg-red-500 rounded-full"
              style={{ left: `${(marker / eegData.length) * 100}%` }}
              title="检测到癫痫"
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-sm text-slate-400">
          <span className="font-mono">{formatTime(currentIndex)}</span>
          <span className="font-mono">{formatTime(eegData.length)}</span>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handleSkipBack}
            disabled={eegData.length === 0}
            className="p-3 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          
          <button
            onClick={handlePlayPause}
            disabled={eegData.length === 0}
            className="p-4 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-1" />
            )}
          </button>
          
          <button
            onClick={handleSkipForward}
            disabled={eegData.length === 0}
            className="p-3 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Gauge className="w-4 h-4 text-slate-400" />
          <div className="flex gap-1">
            {speedOptions.map(speed => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                  playbackSpeed === speed
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 pt-2">
          <div className="bg-slate-900/50 rounded-lg p-2 text-center">
            <div className="text-lg font-mono text-white">{eegData.length}</div>
            <div className="text-xs text-slate-400">采样点数</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 text-center">
            <div className="text-lg font-mono text-white">{formatTime(eegData.length)}</div>
            <div className="text-xs text-slate-400">总时长</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 text-center">
            <div className="text-lg font-mono text-red-400">
              {detectionResults.filter(r => r.isSeizure).length}
            </div>
            <div className="text-xs text-slate-400">癫痫事件</div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 text-center">
            <div className="text-lg font-mono text-blue-400">256</div>
            <div className="text-xs text-slate-400">采样率 Hz</div>
          </div>
        </div>
      </div>
    </div>
  );
}
