import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Video, Circle, Square, Download, Clock, Dot, FileVideo } from 'lucide-react';
import { useStore } from '../store/useStore';

interface VideoRecorderProps {
  videoRef: React.RefObject<HTMLVideoElement>;
}

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ videoRef }) => {
  const { videoRecording, startVideoRecording, stopVideoRecording, setVideoRecordingDuration } = useStore();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (videoRecording.isRecording) {
      interval = setInterval(() => {
        const duration = Math.floor((Date.now() - videoRecording.startTime) / 1000);
        setRecordingTime(duration);
        setVideoRecordingDuration(duration);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [videoRecording.isRecording, videoRecording.startTime, setVideoRecordingDuration]);

  const startRecording = useCallback(() => {
    if (!videoRef.current) return;

    const stream = videoRef.current.captureStream();
    const audioStream = videoRef.current.srcObject as MediaStream;
    if (audioStream) {
      audioStream.getAudioTracks().forEach(track => stream.addTrack(track));
    }

    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    
    let selectedMimeType = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedMimeType = type;
        break;
      }
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: selectedMimeType || undefined,
      videoBitsPerSecond: 2500000,
    });

    chunksRef.current = [];
    
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: selectedMimeType || 'video/webm' });
      setRecordedBlob(blob);
      const now = new Date();
      const defaultName = `robot-recording-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
      setFileName(defaultName);
    };

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    startVideoRecording();
  }, [videoRef, startVideoRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopVideoRecording();
    setRecordingTime(0);
  }, [stopVideoRecording]);

  const downloadVideo = useCallback(() => {
    if (!recordedBlob) return;

    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [recordedBlob, fileName]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-[#0a1628]/60 backdrop-blur rounded-lg border border-cyan-500/20 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-cyan-400 font-mono text-sm flex items-center gap-2">
          <Video size={16} />
          操作录像
        </h3>
        <div className="flex items-center gap-2">
          {videoRecording.isRecording ? (
            <>
              <span className="text-xs font-mono text-red-400 flex items-center gap-1">
                <Dot size={12} className="animate-pulse" />
                录制中 {formatTime(recordingTime)}
              </span>
              <button
                onClick={stopRecording}
                className="p-2 bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 hover:bg-red-500/30 transition-all"
                title="停止录制"
              >
                <Square size={16} />
              </button>
            </>
          ) : (
            <button
              onClick={startRecording}
              className="p-2 bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 hover:bg-red-500/30 transition-all"
              title="开始录制"
            >
              <Circle size={16} className="fill-current" />
            </button>
          )}
        </div>
      </div>

      {recordedBlob && !videoRecording.isRecording && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-white/5 rounded-lg">
            <FileVideo size={20} className="text-cyan-400" />
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full bg-transparent text-sm text-white focus:outline-none border-b border-transparent focus:border-cyan-500/50"
              />
              <div className="text-xs text-white/50 flex items-center gap-2">
                <Clock size={10} />
                {formatTime(videoRecording.duration)} · {(recordedBlob.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
            <button
              onClick={downloadVideo}
              className="p-2 bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/30 transition-all"
              title="下载录像"
            >
              <Download size={16} />
            </button>
          </div>
          
          <div className="text-xs text-white/50">
            格式: WebM · 分辨率: 取决于视频源
          </div>
        </div>
      )}

      {!recordedBlob && !videoRecording.isRecording && (
        <div className="text-center py-4 text-white/40 text-sm">
          点击录制按钮开始录制操作视频
        </div>
      )}
    </div>
  );
};
