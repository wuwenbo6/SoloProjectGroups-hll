import { useRef, useEffect, useCallback } from 'react';
import type { FFTResult } from '@/utils/fft';

interface SpectrumChartProps {
  fftResult: FFTResult;
  dbSpectrum: Float64Array;
  oversampleRatio: number;
  width: number;
  height: number;
}

export default function SpectrumChart({ fftResult, dbSpectrum, oversampleRatio, width, height }: SpectrumChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fftResult || dbSpectrum.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pad = { top: 20, right: 16, bottom: 36, left: 56 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    ctx.fillStyle = '#0c1222';
    ctx.fillRect(0, 0, width, height);

    const { frequency, snr, signalPowerDb, noiseFloorDb, peakFreq } = fftResult;
    const numBins = frequency.length;
    const signalBandEnd = Math.min(numBins, Math.floor(numBins / oversampleRatio));

    const dbMin = Math.max(noiseFloorDb - 20, -160);
    const dbMax = Math.min(signalPowerDb + 15, 10);
    const dbRange = dbMax - dbMin;

    const freqMax = frequency[signalBandEnd - 1] || frequency[numBins - 1];
    const displayBins = Math.min(numBins, signalBandEnd * 4);
    const displayFreqMax = frequency[displayBins - 1];

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.lineWidth = 1;

    const numGridY = 6;
    for (let i = 0; i <= numGridY; i++) {
      const y = pad.top + (plotH * i) / numGridY;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
    }

    const numGridX = 6;
    for (let i = 0; i <= numGridX; i++) {
      const x = pad.left + (plotW * i) / numGridX;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
    }

    const signalBandX = pad.left + (freqMax / displayFreqMax) * plotW;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.04)';
    ctx.fillRect(pad.left, pad.top, signalBandX - pad.left, plotH);

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(signalBandX, pad.top);
    ctx.lineTo(signalBandX, pad.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(16, 185, 129, 0.7)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Signal BW', signalBandX, pad.top - 4);

    const gradient = ctx.createLinearGradient(pad.left, 0, pad.left + plotW, 0);
    gradient.addColorStop(0, '#3b82f6');
    gradient.addColorStop(0.3, '#6366f1');
    gradient.addColorStop(0.7, '#8b5cf6');
    gradient.addColorStop(1, '#a855f7');

    ctx.beginPath();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.2;

    const step = Math.max(1, Math.floor(displayBins / (plotW * 1.5)));
    let first = true;
    for (let k = 1; k < displayBins; k += step) {
      const x = pad.left + (frequency[k] / displayFreqMax) * plotW;
      const clamped = Math.max(dbMin, Math.min(dbMax, dbSpectrum[k]));
      const normalized = (clamped - dbMin) / dbRange;
      const y = pad.top + plotH - normalized * plotH;
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= numGridY; i++) {
      const dbVal = dbMax - (dbRange * i) / numGridY;
      const y = pad.top + (plotH * i) / numGridY;
      ctx.fillText(dbVal.toFixed(0), pad.left - 6, y + 3);
    }

    ctx.textAlign = 'center';
    for (let i = 0; i <= numGridX; i++) {
      const x = pad.left + (plotW * i) / numGridX;
      const f = (displayFreqMax * i) / numGridX;
      let label: string;
      if (f >= 1e6) {
        label = (f / 1e6).toFixed(1) + ' MHz';
      } else if (f >= 1e3) {
        label = (f / 1e3).toFixed(1) + ' kHz';
      } else {
        label = f.toFixed(0) + ' Hz';
      }
      ctx.fillText(label, x, pad.top + plotH + 18);
    }

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SNR: ${snr.toFixed(1)} dB`, pad.left + 8, pad.top + 14);

    if (peakFreq > 0) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.font = '9px "JetBrains Mono", monospace';
      const peakX = pad.left + (peakFreq / displayFreqMax) * plotW;
      ctx.fillText(`▼ ${peakFreq >= 1e3 ? (peakFreq / 1e3).toFixed(1) + 'k' : peakFreq.toFixed(0)} Hz`, peakX + 4, pad.top + 28);
    }

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Frequency (Hz)', pad.left + plotW / 2, height - 4);

    ctx.save();
    ctx.translate(12, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Magnitude (dB)', 0, 0);
    ctx.restore();
  }, [fftResult, dbSpectrum, oversampleRatio, width, height]);

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
