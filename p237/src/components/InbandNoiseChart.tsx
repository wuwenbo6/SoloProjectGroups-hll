import { useRef, useEffect, useCallback } from 'react';
import type { FFTResult } from '@/utils/fft';

interface InbandNoiseChartProps {
  fftResult: FFTResult;
  width: number;
  height: number;
  order: number;
}

export default function InbandNoiseChart({ fftResult, width, height, order }: InbandNoiseChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fftResult) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pad = { top: 24, right: 16, bottom: 40, left: 60 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    ctx.fillStyle = '#0c1222';
    ctx.fillRect(0, 0, width, height);

    const { frequency, inbandNoisePower, cumulativeNoise, signalBandEndIdx, maxIdx, totalInbandNoiseDb, snr } = fftResult;
    const numBins = signalBandEndIdx;

    const noiseDb = new Float64Array(numBins);
    const cumNoiseDb = new Float64Array(numBins);
    let maxNoiseDb = -200;
    let minNoiseDb = 0;
    let maxCumDb = -200;
    let minCumDb = 0;

    for (let k = 0; k < numBins; k++) {
      noiseDb[k] = 10 * Math.log10(inbandNoisePower[k] + 1e-40);
      cumNoiseDb[k] = 10 * Math.log10(cumulativeNoise[k] + 1e-40);
      maxNoiseDb = Math.max(maxNoiseDb, noiseDb[k]);
      minNoiseDb = Math.min(minNoiseDb, noiseDb[k]);
      maxCumDb = Math.max(maxCumDb, cumNoiseDb[k]);
      minCumDb = Math.min(minCumDb, cumNoiseDb[k]);
    }

    const yMin = Math.max(minNoiseDb, -180);
    const yMax = Math.min(maxNoiseDb + 10, 20);
    const yRange = yMax - yMin;

    const freqMax = frequency[numBins - 1];

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

    const signalBinWidth = 5;
    const sigStart = Math.max(1, maxIdx - signalBinWidth);
    const sigEnd = Math.min(numBins - 1, maxIdx + signalBinWidth);
    const sigStartX = pad.left + (frequency[sigStart] / freqMax) * plotW;
    const sigEndX = pad.left + (frequency[sigEnd] / freqMax) * plotW;

    ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    ctx.fillRect(sigStartX, pad.top, sigEndX - sigStartX, plotH);

    const noiseGradient = ctx.createLinearGradient(pad.left, pad.top, pad.left, pad.top + plotH);
    noiseGradient.addColorStop(0, 'rgba(249, 115, 22, 0.85)');
    noiseGradient.addColorStop(0.5, 'rgba(251, 146, 60, 0.7)');
    noiseGradient.addColorStop(1, 'rgba(251, 191, 36, 0.5)');

    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    const step = Math.max(1, Math.floor(numBins / (plotW * 2)));
    for (let k = 1; k < numBins; k += step) {
      const x = pad.left + (frequency[k] / freqMax) * plotW;
      const clamped = Math.max(yMin, Math.min(yMax, noiseDb[k]));
      const normalized = (clamped - yMin) / yRange;
      const y = pad.top + plotH - normalized * plotH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = noiseGradient;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.5;
    for (let k = 1; k < numBins; k += step) {
      const x = pad.left + (frequency[k] / freqMax) * plotW;
      const clamped = Math.max(yMin, Math.min(yMax, noiseDb[k]));
      const normalized = (clamped - yMin) / yRange;
      const y = pad.top + plotH - normalized * plotH;
      if (k === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const cumYMin = Math.max(minCumDb - 10, -180);
    const cumYMax = Math.min(maxCumDb + 10, 20);
    const cumYRange = cumYMax - cumYMin;

    ctx.beginPath();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    for (let k = 1; k < numBins; k += step) {
      const x = pad.left + (frequency[k] / freqMax) * plotW;
      const clamped = Math.max(cumYMin, Math.min(cumYMax, cumNoiseDb[k]));
      const normalized = (clamped - cumYMin) / cumYRange;
      const y = pad.top + plotH - normalized * plotH;
      if (k === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= numGridY; i++) {
      const dbVal = yMax - (yRange * i) / numGridY;
      const y = pad.top + (plotH * i) / numGridY;
      ctx.fillText(dbVal.toFixed(0), pad.left - 6, y + 3);
    }

    ctx.textAlign = 'center';
    for (let i = 0; i <= numGridX; i++) {
      const x = pad.left + (plotW * i) / numGridX;
      const f = (freqMax * i) / numGridX;
      let label: string;
      if (f >= 1e3) {
        label = (f / 1e3).toFixed(1) + ' kHz';
      } else {
        label = f.toFixed(0) + ' Hz';
      }
      ctx.fillText(label, x, pad.top + plotH + 18);
    }

    ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`In-band Noise Power: ${totalInbandNoiseDb.toFixed(1)} dB`, pad.left + 8, pad.top + 14);

    ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
    ctx.fillText(`SNR: ${snr.toFixed(1)} dB`, pad.left + 200, pad.top + 14);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`▼ Noise PSD`, pad.left + 8, pad.top + 32);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.8)';
    ctx.fillText(`— Cumulative Noise`, pad.left + 120, pad.top + 32);

    ctx.fillStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.fillRect(pad.left + 8, pad.top + 38, 16, 3);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.fillText('Signal Band (excluded)', pad.left + 30, pad.top + 44);

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
    ctx.fillText('Noise Power (dB)', 0, 0);
    ctx.restore();

    ctx.fillStyle = order === 2 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(59, 130, 246, 0.8)';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${order}nd-order CRFF`, pad.left + plotW, pad.top - 8);
  }, [fftResult, width, height, order]);

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
