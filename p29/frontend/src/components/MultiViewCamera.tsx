import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CameraDevice, getAvailableCameras, selectOptimalCameras, MultiViewFusion, ViewData } from '../utils/multiViewFusion';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { cropLipROI } from '../utils/lipExtraction';
import { LipLandmarks, FaceOrientation } from '../types';

interface MultiViewCameraProps {
  onFusedResult: (data: {
    lipLandmarks: LipLandmarks | null;
    orientation: FaceOrientation | null;
    lipROI: ImageData | null;
  }) => void;
  enabled?: boolean;
}

export const MultiViewCamera: React.FC<MultiViewCameraProps> = ({
  onFusedResult,
  enabled = true
}) => {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameras, setSelectedCameras] = useState<string[]>([]);
  const [activeStreams, setActiveStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const fusionRef = useRef<MultiViewFusion>(new MultiViewFusion(2));
  const animationRef = useRef<number>();

  const mediaPipe = useMediaPipe();

  useEffect(() => {
    loadCameras();
    return () => {
      stopAllStreams();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const loadCameras = async () => {
    setIsLoading(true);
    const available = await getAvailableCameras();
    setCameras(available);
    
    if (available.length > 0) {
      const optimal = selectOptimalCameras(available, 2);
      setSelectedCameras(optimal.map(c => c.deviceId));
    }
    setIsLoading(false);
  };

  const toggleCamera = async (deviceId: string) => {
    if (activeStreams.has(deviceId)) {
      stopCamera(deviceId);
    } else {
      await startCamera(deviceId);
    }
  };

  const startCamera = async (deviceId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });

      const newStreams = new Map(activeStreams);
      newStreams.set(deviceId, stream);
      setActiveStreams(newStreams);

      const video = videoRefs.current.get(deviceId);
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
    } catch (err) {
      console.error(`Error starting camera ${deviceId}:`, err);
    }
  };

  const stopCamera = (deviceId: string) => {
    const stream = activeStreams.get(deviceId);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    const newStreams = new Map(activeStreams);
    newStreams.delete(deviceId);
    setActiveStreams(newStreams);

    const video = videoRefs.current.get(deviceId);
    if (video) {
      video.srcObject = null;
    }
  };

  const stopAllStreams = () => {
    activeStreams.forEach(stream => {
      stream.getTracks().forEach(track => track.stop());
    });
    setActiveStreams(new Map());
  };

  const processFrames = useCallback(async () => {
    if (!enabled || !mediaPipe.isInitialized) {
      animationRef.current = requestAnimationFrame(processFrames);
      return;
    }

    for (const [deviceId, stream] of activeStreams) {
      const video = videoRefs.current.get(deviceId);
      const canvas = canvasRefs.current.get(deviceId);
      
      if (!video || !canvas || stream.getVideoTracks().length === 0) continue;

      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      if (canvas.width > 0 && canvas.height > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          await mediaPipe.detect(canvas);

          if (mediaPipe.lastResults?.lipLandmarks && mediaPipe.lastResults.orientation) {
            const weight = fusionRef.current.calculateViewWeight(mediaPipe.lastResults.orientation);
            const lipROI = cropLipROI(canvas, mediaPipe.lastResults.lipLandmarks.boundingBox, 64);

            const viewData: ViewData = {
              cameraId: deviceId,
              lipLandmarks: mediaPipe.lastResults.lipLandmarks,
              orientation: mediaPipe.lastResults.orientation,
              lipROI,
              timestamp: Date.now(),
              weight
            };

            fusionRef.current.addView(viewData);
          }
        } catch (err) {
          console.error('Error processing frame:', err);
        }
      }
    }

    const fusedLandmarks = fusionRef.current.fuseLandmarks();
    const fusedROI = fusionRef.current.fuseROIs(64);
    const bestView = fusionRef.current.getBestView();

    onFusedResult({
      lipLandmarks: fusedLandmarks,
      orientation: bestView?.orientation || null,
      lipROI: fusedROI
    });

    animationRef.current = requestAnimationFrame(processFrames);
  }, [enabled, activeStreams, mediaPipe, onFusedResult]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(processFrames);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [processFrames]);

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
          多视角融合
          {activeStreams.size > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
              {activeStreams.size} 个摄像头
            </span>
          )}
        </h3>
        <button
          onClick={loadCameras}
          disabled={isLoading}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          刷新
        </button>
      </div>

      {cameras.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p>{isLoading ? '正在检测摄像头...' : '未检测到摄像头'}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {cameras.slice(0, 4).map((camera) => (
              <div key={camera.deviceId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300 truncate flex-1">
                    {camera.label}
                  </span>
                  <button
                    onClick={() => toggleCamera(camera.deviceId)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      activeStreams.has(camera.deviceId)
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {activeStreams.has(camera.deviceId) ? '已开启' : '开启'}
                  </button>
                </div>
                
                <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(camera.deviceId, el);
                    }}
                    className="w-full h-full object-cover transform scale-x-[-1]"
                    autoPlay
                    playsInline
                    muted
                  />
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current.set(camera.deviceId, el);
                    }}
                    className="hidden"
                  />
                  {!activeStreams.has(camera.deviceId) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-gray-600 text-sm">未启用</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {activeStreams.size > 0 && (
            <div className="pt-4 border-t border-gray-700">
              <p className="text-xs text-gray-500 mb-2">融合状态</p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  <span className="text-sm text-gray-400">
                    视角融合: {fusionRef.current.getViewCount()} 路
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${fusionRef.current.getBestView() ? 'bg-green-400' : 'bg-yellow-400'}`}></span>
                  <span className="text-sm text-gray-400">
                    {fusionRef.current.getBestView() ? '最佳视角可用' : '等待正面视角'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
