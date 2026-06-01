import { useEffect, useRef, useCallback } from 'react';
import { EEGData } from '../hooks/useBluetooth';

interface EEGWaveformProps {
  data: EEGData[];
  channelNames?: string[];
  height?: number;
}

const CHANNEL_COLORS = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#ef4444'
];

const DEFAULT_CHANNELS = ['TP9', 'AF7', 'AF8', 'TP10'];

export function EEGWaveform({ data, channelNames = DEFAULT_CHANNELS, height = 400 }: EEGWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const numChannels = channelNames.length;
    const channelHeight = height / numChannels;
    const padding = 10;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= numChannels; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * channelHeight);
      ctx.lineTo(width, i * channelHeight);
      ctx.stroke();
    }

    for (let c = 0; c < numChannels; c++) {
      const centerY = c * channelHeight + channelHeight / 2;
      const amplitude = channelHeight / 2 - padding;

      ctx.fillStyle = CHANNEL_COLORS[c];
      ctx.font = '12px monospace';
      ctx.fillText(channelNames[c], 8, c * channelHeight + 20);

      ctx.strokeStyle = CHANNEL_COLORS[c];
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const maxPoints = Math.min(data.length, width);
      const startIndex = Math.max(0, data.length - width);

      for (let i = 0; i < maxPoints; i++) {
        const dataIndex = startIndex + i;
        if (dataIndex >= data.length) break;

        const value = data[dataIndex].channelData[c] || 0;
        const normalizedValue = Math.tanh(value * 50);
        const x = (i / maxPoints) * width;
        const y = centerY + normalizedValue * amplitude;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }

  }, [data, channelNames, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = height;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const animate = () => {
      drawWaveform();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [drawWaveform, height]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px` }}
      />
      <div className="absolute top-2 right-2 text-xs text-slate-500 font-mono">
        {data.length} samples
      </div>
    </div>
  );
}
