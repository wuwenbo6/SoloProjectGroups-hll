import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoRef }) => {
  const { webRTC, forceFeedback } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const warningOverlay = forceFeedback.warning === 'danger'
    ? 'rgba(255, 71, 87, 0.15)'
    : forceFeedback.warning === 'caution'
    ? 'rgba(255, 193, 7, 0.1)'
    : 'transparent';

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black rounded-lg overflow-hidden"
      style={{
        boxShadow: `0 0 40px rgba(0, 212, 255, 0.1), inset 0 0 100px ${warningOverlay}`,
        border: forceFeedback.warning !== 'none'
          ? `2px solid ${forceFeedback.warning === 'danger' ? '#ff4757' : '#ffc107'}`
          : '1px solid rgba(0, 212, 255, 0.2)',
      }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        muted
        style={{
          filter: forceFeedback.warning === 'danger'
            ? 'saturate(1.2) contrast(1.1)'
            : 'none',
        }}
      />
      
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.1) 2px, rgba(0, 0, 0, 0.1) 4px)',
          opacity: 0.3,
        }}
      />
      
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.4) 100%)',
        }}
      />

      {!webRTC.isConnected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4" />
          <span className="text-cyan-400 font-mono text-sm">等待视频连接...</span>
        </div>
      )}

      <div className="absolute top-4 left-4 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${webRTC.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-white/80 font-mono text-xs">
          {webRTC.isConnected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      {forceFeedback.warning !== 'none' && (
        <div className="absolute top-4 right-4">
          <div
            className={`px-3 py-1 rounded font-mono text-xs font-bold ${
              forceFeedback.warning === 'danger'
                ? 'bg-red-500/80 text-white animate-pulse'
                : 'bg-yellow-500/80 text-black'
            }`}
          >
            {forceFeedback.warning === 'danger' ? '⚠ 危险 - 虚拟墙' : '⚡ 注意 - 接近障碍物'}
          </div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 text-right">
        <div className="text-cyan-400/60 font-mono text-xs">
          {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};
