import { useRef, useEffect, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Flag, PlaySquare } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { formatTime } from '../utils/format.js';
import type { Recording } from '../../shared/types.js';

interface VideoPlayerProps {
  recording: Recording | null;
  videoUrl: string;
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onAddEvent?: (timestamp: number) => void;
}

export function VideoPlayer({
  recording,
  videoUrl,
  currentTime,
  isPlaying,
  onTimeUpdate,
  onPlayingChange,
  onAddEvent,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isLoaded) return;

    const targetTime = (currentTime - (recording?.startTime || 0)) / 1000;
    if (Math.abs(video.currentTime - targetTime) > 0.5) {
      video.currentTime = targetTime;
    }
  }, [currentTime, recording, isLoaded]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !recording) return;

    const time = recording.startTime + video.currentTime * 1000;
    onTimeUpdate(time);
  };

  const handleLoadedMetadata = () => {
    setIsLoaded(true);
  };

  const togglePlay = () => {
    onPlayingChange(!isPlaying);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleAddEvent = () => {
    if (onAddEvent && recording) {
      onAddEvent(currentTime);
    }
  };

  if (!recording) {
    return (
      <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center">
        <div className="text-slate-500 text-center">
          <PlaySquare size={64} className="mx-auto mb-4 opacity-30" />
          <p>选择录像进行播放</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-slate-900 rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        src="https://www.w3schools.com/html/mov_bbb.mp4"
        className="w-full aspect-video"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        muted={isMuted}
        loop
      />
      
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-cyan-500 flex items-center justify-center text-white hover:bg-cyan-400 transition-colors"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            
            <button
              onClick={toggleMute}
              className="w-10 h-10 rounded-full bg-slate-700/50 flex items-center justify-center text-slate-300 hover:bg-slate-700 transition-colors"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            
            <span className="text-white text-sm font-mono">
              {formatTime(currentTime - recording.startTime)} / {formatTime(recording.duration)}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {onAddEvent && (
              <button
                onClick={handleAddEvent}
                className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors flex items-center gap-2"
              >
                <Flag size={16} />
                <span className="text-sm">标记事件</span>
              </button>
            )}
            
            <button className="w-10 h-10 rounded-full bg-slate-700/50 flex items-center justify-center text-slate-300 hover:bg-slate-700 transition-colors">
              <Maximize size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
