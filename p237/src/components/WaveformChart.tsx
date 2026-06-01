import { useRef, useEffect, useCallback } from 'react';

interface WaveformChartProps {
  time: Float64Array;
  signals: {
    data: Float64Array;
    color: string;
    label: string;
  }[];
  width: number;
  height: number;
  maxPoints?: number;
}

export default function WaveformChart({ time, signals, width, height, maxPoints = 2000 }: WaveformChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || time.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pad = { top: 20, right: 16, bottom: 32, left: 52 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    ctx.fillStyle = '#0c1222';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const x = pad.left + (plotW * i) / 8;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
    }

    const step = Math.max(1, Math.floor(time.length / maxPoints));
    const minVal = -1.5;
    const maxVal = 1.5;
    const range = maxVal - minVal;

    for (const signal of signals) {
      ctx.beginPath();
      ctx.strokeStyle = signal.color;
      ctx.lineWidth = 1.2;
      let first = true;
      for (let i = 0; i < time.length; i += step) {
        const x = pad.left + (i / (time.length - 1)) * plotW;
        const normalized = (signal.data[i] - minVal) / range;
        const y = pad.top + plotH - normalized * plotH;
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = maxVal - (range * i) / 4;
      const y = pad.top + (plotH * i) / 4;
      ctx.fillText(val.toFixed(1), pad.left - 6, y + 3);
    }

    ctx.textAlign = 'center';
    const tMax = time[time.length - 1];
    for (let i = 0; i <= 8; i++) {
      const x = pad.left + (plotW * i) / 8;
      const t = (tMax * i) / 8;
      let label: string;
      if (t >= 1e-3) {
        label = (t * 1e3).toFixed(1) + ' ms';
      } else {
        label = (t * 1e6).toFixed(0) + ' μs';
      }
      ctx.fillText(label, x, pad.top + plotH + 18);
    }

    ctx.textAlign = 'left';
    let legendY = pad.top + 12;
    for (const signal of signals) {
      ctx.fillStyle = signal.color;
      ctx.fillRect(pad.left + 8, legendY - 6, 16, 3);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
      ctx.fillText(signal.label, pad.left + 30, legendY);
      legendY += 16;
    }

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);
  }, [time, signals, width, height, maxPoints]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="rounded-lg"
    />
  );
}
