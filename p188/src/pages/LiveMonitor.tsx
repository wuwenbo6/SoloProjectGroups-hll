import { useState, useEffect, useRef } from 'react';
import { Play, Square, Clock, Film, Radio, RefreshCw } from 'lucide-react';
import { useCameraStore } from '../store/cameraStore.js';
import { api } from '../utils/api.js';
import { formatDuration, formatDateTime, formatFileSize } from '../utils/format.js';
import { CameraCard } from '../components/CameraCard.js';
import { MotionDetectionPanel } from '../components/MotionDetectionPanel.js';
import type { Camera, RecordingSegment } from '../../shared/types.js';

export function LiveMonitor() {
  const { 
    cameras, 
    selectedCamera, 
    recordingStatus, 
    segments,
    latestSegment,
    isLiveMode,
    setCameras, 
    setSelectedCamera, 
    setRecordingStatus,
    setSegments,
    setLatestSegment,
    setIsLiveMode,
  } = useCameraStore();
  
  const [recordingTime, setRecordingTime] = useState(0);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [segmentInfo, setSegmentInfo] = useState<{ segmentDuration: number; description: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    loadCameras();
    loadRecordingStatus();
    loadSegmentInfo();
    
    const statusInterval = setInterval(loadRecordingStatus, 2000);
    const segmentInterval = setInterval(loadLatestSegment, 3000);
    
    return () => {
      clearInterval(statusInterval);
      clearInterval(segmentInterval);
    };
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (recordingStatus.isRecording && recordingStatus.startTime) {
      timer = setInterval(() => {
        setRecordingTime(Date.now() - (recordingStatus.startTime || 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [recordingStatus]);

  useEffect(() => {
    if (recordingStatus.isRecording && selectedCamera) {
      checkActiveRecording();
    }
  }, [recordingStatus.isRecording, selectedCamera]);

  useEffect(() => {
    if (activeRecordingId && isLiveMode) {
      loadSegments();
      const interval = setInterval(loadSegments, 5000);
      return () => clearInterval(interval);
    }
  }, [activeRecordingId, isLiveMode]);

  async function loadCameras() {
    try {
      const data = await api.getCameras() as Camera[];
      setCameras(data);
      if (data.length > 0 && !selectedCamera) {
        setSelectedCamera(data[0]);
      }
    } catch (error) {
      console.error('Failed to load cameras:', error);
    }
  }

  async function loadRecordingStatus() {
    try {
      const status = await api.getRecordingStatus() as any;
      setRecordingStatus(status);
    } catch (error) {
      console.error('Failed to load recording status:', error);
    }
  }

  async function loadSegmentInfo() {
    try {
      const info = await api.getSegmentInfo() as any;
      setSegmentInfo(info);
    } catch (error) {
      console.error('Failed to load segment info:', error);
    }
  }

  async function checkActiveRecording() {
    if (!selectedCamera) return;
    try {
      const data = await api.getActiveRecording(selectedCamera.id) as any;
      if (data.activeRecordingId) {
        setActiveRecordingId(data.activeRecordingId);
      }
    } catch (error) {
      console.error('Failed to check active recording:', error);
    }
  }

  async function loadSegments() {
    if (!activeRecordingId) return;
    try {
      const data = await api.getRecordingSegments(activeRecordingId) as any;
      setSegments(data.segments);
    } catch (error) {
      console.error('Failed to load segments:', error);
    }
  }

  async function loadLatestSegment() {
    if (!activeRecordingId) return;
    try {
      const segment = await api.getLatestSegment(activeRecordingId) as RecordingSegment;
      setLatestSegment(segment);
    } catch (error) {
      console.error('Failed to load latest segment:', error);
    }
  }

  async function handleStartRecording() {
    if (!selectedCamera) return;
    try {
      const recording = await api.startRecording(selectedCamera.id) as any;
      setActiveRecordingId(recording.id);
      setIsLiveMode(true);
      loadRecordingStatus();
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }

  async function handleStopRecording() {
    try {
      await api.stopRecording();
      setActiveRecordingId(null);
      setIsLiveMode(false);
      loadRecordingStatus();
      setRecordingTime(0);
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }

  async function handlePlayLatest() {
    if (!activeRecordingId) return;
    setIsLiveMode(true);
    loadLatestSegment();
    if (videoRef.current) {
      videoRef.current.src = api.getLatestSegmentVideoUrl(activeRecordingId);
      videoRef.current.play().catch(() => {});
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">实时监控</h1>
          <p className="text-slate-400 mt-1">
            查看摄像头实时画面并进行录制
            {segmentInfo && (
              <span className="ml-2 text-xs text-slate-500">
                (每 {segmentInfo.segmentDuration / 60000} 分钟自动分段存储)
              </span>
            )}
          </p>
        </div>
        
        {recordingStatus.isRecording && (
          <div className="flex items-center gap-3 px-4 py-2 bg-red-500/20 rounded-xl border border-red-500/30">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-red-400 font-medium">录制中</span>
            <span className="text-red-400 font-mono">{formatDuration(recordingTime)}</span>
            <span className="text-red-400/60 text-xs">
              分段 #{recordingStatus.currentSegmentIndex}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {cameras.map((camera) => (
          <CameraCard
            key={camera.id}
            camera={camera}
            isSelected={selectedCamera?.id === camera.id}
            isRecording={recordingStatus.cameraId === camera.id}
            onClick={() => setSelectedCamera(camera)}
          />
        ))}
      </div>

      {selectedCamera && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-slate-900 rounded-xl p-6 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">{selectedCamera.name}</h2>
                {isLiveMode && (
                  <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full flex items-center gap-1">
                    <Radio size={12} />
                    边录边播
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-sm text-slate-400">在线</span>
              </div>
            </div>

            <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden">
              {isLiveMode && activeRecordingId ? (
                <video
                  ref={videoRef}
                  src="https://www.w3schools.com/html/mov_bbb.mp4"
                  className="w-full h-full object-cover"
                  autoPlay
                  muted
                  loop
                />
              ) : (
                <img
                  src={`https://picsum.photos/seed/${selectedCamera.id}/1200/675?t=${Date.now()}`}
                  alt={selectedCamera.name}
                  className="w-full h-full object-cover"
                />
              )}
              
              {recordingStatus.isRecording && recordingStatus.cameraId === selectedCamera.id && (
                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-red-500 rounded-full">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  <span className="text-xs font-medium text-white">REC</span>
                </div>
              )}

              <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-black/60 rounded-lg">
                <Clock size={14} className="inline mr-1" />
                <span className="text-xs text-white font-mono">
                  {new Date().toLocaleTimeString('zh-CN')}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 mt-6">
              {!recordingStatus.isRecording ? (
                <button
                  onClick={handleStartRecording}
                  className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white font-medium rounded-xl hover:bg-red-400 transition-colors"
                >
                  <div className="w-3 h-3 bg-white rounded-full" />
                  开始录制
                </button>
              ) : (
                <>
                  <button
                    onClick={handleStopRecording}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-700 text-white font-medium rounded-xl hover:bg-slate-600 transition-colors"
                  >
                    <Square size={16} />
                    停止录制
                  </button>
                  <button
                    onClick={handlePlayLatest}
                    className="flex items-center gap-2 px-6 py-3 bg-cyan-600 text-white font-medium rounded-xl hover:bg-cyan-500 transition-colors"
                  >
                    <RefreshCw size={16} />
                    播放最新分段
                  </button>
                </>
              )}
              
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-xl text-slate-400">
                <Play size={16} />
                <span className="text-sm">实时流</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <MotionDetectionPanel />

            {recordingStatus.isRecording && (
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <div className="flex items-center gap-2 mb-3">
                  <Film size={18} className="text-cyan-400" />
                  <h3 className="font-semibold text-white">录制分段</h3>
                </div>
                
                {latestSegment && (
                  <div className="bg-cyan-500/10 rounded-lg p-3 mb-3 border border-cyan-500/30">
                    <div className="text-xs text-cyan-400 font-medium mb-1">当前分段</div>
                    <div className="text-sm text-white">{formatDateTime(latestSegment.startTime)}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {formatFileSize(latestSegment.fileSize)}
                    </div>
                  </div>
                )}

                <div className="max-h-64 overflow-y-auto space-y-2">
                  {[...segments].reverse().map((segment) => (
                    <div
                      key={segment.id}
                      className={cn(
                        'p-3 rounded-lg border transition-colors cursor-pointer',
                        latestSegment?.id === segment.id
                          ? 'bg-cyan-500/10 border-cyan-500/30'
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-400">
                          #{segment.segmentIndex}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatDuration(segment.duration)}
                        </span>
                      </div>
                      <div className="text-sm text-white mt-1">
                        {formatDateTime(segment.startTime)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatFileSize(segment.fileSize)}
                      </div>
                    </div>
                  ))}
                </div>

                {segments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-500">
                    共 {segments.length} 个分段
                  </div>
                )}
              </div>
            )}

            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <h3 className="font-semibold text-white mb-3">录制配置</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">分段时长</span>
                  <span className="text-white font-mono">
                    {segmentInfo ? `${segmentInfo.segmentDuration / 60000} 分钟` : '10 分钟'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">索引频率</span>
                  <span className="text-white font-mono">每秒</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">存储格式</span>
                  <span className="text-white font-mono">MP4</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">索引文件</span>
                  <span className="text-white font-mono">JSON</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-4">
                录制过程中自动分段存储，生成时间轴索引，支持精确seek和边录边播。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
