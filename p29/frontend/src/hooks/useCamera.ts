import { useState, useRef, useEffect, useCallback } from 'react';

interface UseCameraOptions {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
}

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isStreaming: boolean;
  error: string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  captureFrame: () => ImageData | null;
}

export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
  const { width = 640, height = 480, facingMode = 'user' } = options;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsStreaming(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '无法访问摄像头';
      setError(message);
      console.error('Camera error:', err);
    }
  }, [width, height, facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  const captureFrame = useCallback((): ImageData | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    canvas.width = video.videoWidth || width;
    canvas.height = video.videoHeight || height;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, [width, height]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    isStreaming,
    error,
    startCamera,
    stopCamera,
    captureFrame
  };
}
