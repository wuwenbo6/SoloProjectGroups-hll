import React, { useEffect, useRef, useCallback } from 'react';
import { LipLandmarks, FaceOrientation } from '../types';

interface CameraPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isStreaming: boolean;
  lipLandmarks: LipLandmarks | null;
  orientation: FaceOrientation | null;
  showLandmarks?: boolean;
  showOrientation?: boolean;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  videoRef,
  canvasRef,
  isStreaming,
  lipLandmarks,
  orientation,
  showLandmarks = true,
  showOrientation = true
}) => {
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const drawLandmarks = useCallback(() => {
    const overlayCanvas = overlayCanvasRef.current;
    const video = videoRef.current;
    
    if (!overlayCanvas || !video || !isStreaming) return;

    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    overlayCanvas.width = video.videoWidth || 640;
    overlayCanvas.height = video.videoHeight || 480;

    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (showLandmarks && lipLandmarks) {
      ctx.strokeStyle = orientation?.isFrontal ? '#00ff88' : '#ff4444';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(0, 255, 136, 0.3)';

      ctx.beginPath();
      lipLandmarks.upperLip.forEach((point, i) => {
        const x = point.x * overlayCanvas.width;
        const y = point.y * overlayCanvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      lipLandmarks.lowerLip.forEach((point, i) => {
        const x = point.x * overlayCanvas.width;
        const y = point.y * overlayCanvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const { boundingBox } = lipLandmarks;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        boundingBox.x * overlayCanvas.width,
        boundingBox.y * overlayCanvas.height,
        boundingBox.width * overlayCanvas.width,
        boundingBox.height * overlayCanvas.height
      );
      ctx.setLineDash([]);
    }
  }, [isStreaming, lipLandmarks, orientation, showLandmarks, videoRef]);

  useEffect(() => {
    if (isStreaming) {
      drawLandmarks();
    }
  }, [drawLandmarks, isStreaming]);

  const getOrientationColor = () => {
    if (!orientation) return '#666';
    return orientation.isFrontal ? '#00ff88' : '#ff4444';
  };

  const getOrientationMessage = () => {
    if (!orientation) return '检测中...';
    if (orientation.isFrontal) return '✓ 人脸位置良好';
    
    const hints: string[] = [];
    if (Math.abs(orientation.yaw) > 12) {
      hints.push(orientation.yaw > 0 ? '请向左转' : '请向右转');
    }
    if (Math.abs(orientation.pitch) > 15) {
      hints.push(orientation.pitch > 0 ? '请抬头' : '请低头');
    }
    if (Math.abs(orientation.roll) > 10) {
      hints.push(orientation.roll > 0 ? '请向左摆正' : '请向右摆正');
    }
    
    return hints.length > 0 ? hints.join(' / ') : '请正对摄像头';
  };

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-gray-900 shadow-2xl">
      <video
        ref={videoRef}
        className="w-full h-auto transform scale-x-[-1]"
        autoPlay
        playsInline
        muted
        style={{ display: isStreaming ? 'block' : 'none' }}
      />
      
      <canvas
        ref={canvasRef}
        className="hidden"
      />
      
      <canvas
        ref={overlayCanvasRef}
        className="absolute top-0 left-0 w-full h-full transform scale-x-[-1] pointer-events-none"
      />
      
      {!isStreaming && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-700 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-400">点击开始按钮启动摄像头</p>
          </div>
        </div>
      )}

      {showOrientation && isStreaming && (
        <div className="absolute top-4 left-4 right-4 transform scale-x-[-1]">
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-sm"
            style={{ backgroundColor: orientation?.isFrontal ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 68, 68, 0.2)' }}
          >
            <div 
              className="w-3 h-3 rounded-full animate-pulse"
              style={{ backgroundColor: getOrientationColor() }}
            />
            <span 
              className="text-sm font-medium transform scale-x-[-1] inline-block"
              style={{ color: getOrientationColor() }}
            >
              {getOrientationMessage()}
            </span>
          </div>
          
          {orientation && (
            <div className="mt-2 flex gap-4 text-xs text-gray-400 transform scale-x-[-1]">
              <span>偏航: {orientation.yaw.toFixed(1)}°</span>
              <span>俯仰: {orientation.pitch.toFixed(1)}°</span>
              <span>翻滚: {orientation.roll.toFixed(1)}°</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
