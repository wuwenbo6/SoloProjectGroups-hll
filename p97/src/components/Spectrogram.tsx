import { useEffect, useRef, useCallback } from 'react';
import { EEGData } from '../hooks/useBluetooth';

interface SpectrogramProps {
  data: EEGData[];
  channelIndex?: number;
  height?: number;
}

interface BandPowers {
  delta: number;
  theta: number;
  alpha: number;
  beta: number;
  gamma: number;
}

const BAND_COLORS = {
  delta: '#8b5cf6',
  theta: '#3b82f6',
  alpha: '#10b981',
  beta: '#f59e0b',
  gamma: '#ef4444'
};

const BAND_RANGES = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
  gamma: [30, 50]
};

export function Spectrogram({ data, channelIndex = 0, height = 200 }: SpectrogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const fftBufferRef = useRef<number[][]>([]);
  const bandPowersRef = useRef<BandPowers>({ delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 });

  const computeFFT = useCallback((signal: number[]): number[] => {
    const n = signal.length;
    const nfft = 128;
    const paddedSignal = new Array(nfft).fill(0);
    
    for (let i = 0; i < Math.min(n, nfft); i++) {
      paddedSignal[i] = signal[i] * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (nfft - 1)));
    }
    
    const magnitudes: number[] = [];
    for (let k = 0; k < nfft / 2; k++) {
      let real = 0, imag = 0;
      for (let t = 0; t < nfft; t++) {
        const angle = -2 * Math.PI * k * t / nfft;
        real += paddedSignal[t] * Math.cos(angle);
        imag += paddedSignal[t] * Math.sin(angle);
      }
      magnitudes.push(Math.sqrt(real * real + imag * imag) / nfft);
    }
    
    return magnitudes;
  }, []);

  const calculateBandPowers = useCallback((magnitudes: number[], samplingRate: number): BandPowers => {
    const nfft = magnitudes.length * 2;
    const freqResolution = samplingRate / nfft;
    
    const getPowerInBand = (lowFreq: number, highFreq: number): number => {
      let power = 0;
      const startIdx = Math.floor(lowFreq / freqResolution);
      const endIdx = Math.min(Math.ceil(highFreq / freqResolution), magnitudes.length - 1);
      
      for (let i = startIdx; i <= endIdx; i++) {
        power += magnitudes[i] * magnitudes[i];
      }
      return power;
    };
    
    const delta = getPowerInBand(BAND_RANGES.delta[0], BAND_RANGES.delta[1]);
    const theta = getPowerInBand(BAND_RANGES.theta[0], BAND_RANGES.theta[1]);
    const alpha = getPowerInBand(BAND_RANGES.alpha[0], BAND_RANGES.alpha[1]);
    const beta = getPowerInBand(BAND_RANGES.beta[0], BAND_RANGES.beta[1]);
    const gamma = getPowerInBand(BAND_RANGES.gamma[0], BAND_RANGES.gamma[1]);
    
    const total = delta + theta + alpha + beta + gamma + 1e-8;
    
    return {
      delta: delta / total,
      theta: theta / total,
      alpha: alpha / total,
      beta: beta / total,
      gamma: gamma / total
    };
  }, []);

  const drawSpectrogram = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const fftHeight = height * 0.6;
    const barHeight = height * 0.35;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    if (data.length < 128) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('等待数据...', width / 2, fftHeight / 2);
      return;
    }

    const channelData = data.slice(-256).map(d => d.channelData[channelIndex] || 0);
    const magnitudes = computeFFT(channelData);
    const bandPowers = calculateBandPowers(magnitudes, 256);
    bandPowersRef.current = bandPowers;

    const maxMag = Math.max(...magnitudes, 1e-8);
    const barWidth = (width - 100) / magnitudes.length;

    for (let i = 0; i < magnitudes.length; i++) {
      const normalizedMag = Math.min(magnitudes[i] / maxMag, 1);
      const barH = normalizedMag * (fftHeight - 20);
      const x = 60 + i * barWidth;
      const y = fftHeight - barH - 10;

      const freq = (i / magnitudes.length) * 128;
      let color = '#64748b';
      if (freq < 4) color = BAND_COLORS.delta;
      else if (freq < 8) color = BAND_COLORS.theta;
      else if (freq < 13) color = BAND_COLORS.alpha;
      else if (freq < 30) color = BAND_COLORS.beta;
      else color = BAND_COLORS.gamma;

      ctx.fillStyle = color;
      ctx.fillRect(x, y, barWidth - 1, barH);
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (let freq = 0; freq <= 50; freq += 10) {
      const idx = Math.floor((freq / 128) * magnitudes.length);
      const x = 60 + idx * barWidth;
      ctx.fillText(`${freq}Hz`, x, fftHeight);
    }

    const bands: Array<keyof BandPowers> = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
    const bandLabels = ['δ', 'θ', 'α', 'β', 'γ'];
    const bandNames = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];
    const bandWidth = (width - 20) / 5;

    bands.forEach((band, i) => {
      const x = 10 + i * bandWidth;
      const y = fftHeight + 20;
      const power = bandPowers[band];

      ctx.fillStyle = BAND_COLORS[band];
      ctx.fillRect(x, y + 20, bandWidth - 4, 10);
      
      ctx.fillStyle = BAND_COLORS[band];
      ctx.fillRect(x, y + 20, (bandWidth - 4) * power, 10);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bandLabels[i], x + bandWidth / 2 - 2, y + 15);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.fillText(bandNames[i], x + bandWidth / 2 - 2, y);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`${(power * 100).toFixed(0)}%`, x + bandWidth / 2 - 2, y + 45);
    });

  }, [data, channelIndex, height, computeFFT, calculateBandPowers]);

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
      drawSpectrogram();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [drawSpectrogram, height]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px` }}
      />
    </div>
  );
}
