import { useRef, useEffect } from "react";

interface Props {
  spectrum: Float64Array | null;
  width: number;
  height: number;
  pilotIndices?: number[];
  fftSize?: number;
}

const BG = "#0a0e1a";
const GRID_COLOR = "rgba(0,229,255,0.06)";
const AXIS_COLOR = "rgba(0,229,255,0.2)";
const CYAN = "#00e5ff";
const FILL_COLOR = "rgba(0,229,255,0.12)";
const PILOT_COLOR = "#ffab00";

export default function SpectrumCanvas({ spectrum, width, height, pilotIndices, fftSize }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      const padding = 30;
      const plotW = width - padding * 2;
      const plotH = height - padding - 10;
      const baseY = 10 + plotH;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      const half = fftSize ? fftSize / 2 : (spectrum ? Math.floor(spectrum.length / 2) : 32);
      const tickStep = 8;
      const numTicks = Math.floor(half / tickStep);

      for (let i = 0; i <= numTicks; i++) {
        const x = padding + (i / numTicks) * plotW;
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x, baseY);
        ctx.stroke();
      }

      for (let i = 0; i <= 8; i++) {
        const y = 10 + (i / 8) * plotH;
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(padding + plotW, y);
        ctx.stroke();
      }

      ctx.strokeStyle = AXIS_COLOR;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(padding, baseY);
      ctx.lineTo(padding + plotW, baseY);
      ctx.stroke();

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(0,229,255,0.5)";
      ctx.textAlign = "center";
      for (let i = 0; i <= numTicks; i++) {
        const x = padding + (i / numTicks) * plotW;
        const label = i * tickStep;
        ctx.fillText(String(label), x, height - 3);
      }

      if (pilotIndices && pilotIndices.length > 0) {
        ctx.strokeStyle = PILOT_COLOR;
        ctx.lineWidth = 1.5;
        for (const idx of pilotIndices) {
          if (idx >= 0 && idx <= half) {
            const x = padding + (idx / half) * plotW;
            ctx.beginPath();
            ctx.moveTo(x, baseY + 2);
            ctx.lineTo(x, baseY + 6);
            ctx.stroke();
          }
        }
      }

      if (spectrum && spectrum.length > 0) {
        const spectrumHalf = Math.floor(spectrum.length / 2);
        let maxVal = 0;
        for (let i = 0; i < spectrumHalf; i++) {
          if (spectrum[i] > maxVal) maxVal = spectrum[i];
        }
        if (maxVal === 0) maxVal = 1;

        ctx.beginPath();
        ctx.moveTo(padding, baseY);
        for (let i = 0; i < spectrumHalf; i++) {
          const x = padding + (i / spectrumHalf) * plotW;
          const val = spectrum[i] / maxVal;
          const y = baseY - val * plotH * 0.85;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(padding + plotW, baseY);
        ctx.closePath();
        ctx.fillStyle = FILL_COLOR;
        ctx.fill();

        ctx.strokeStyle = CYAN;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < spectrumHalf; i++) {
          const x = padding + (i / spectrumHalf) * plotW;
          const val = spectrum[i] / maxVal;
          const y = baseY - val * plotH * 0.85;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.font = '13px "Noto Sans SC", sans-serif';
      ctx.fillStyle = "rgba(0,229,255,0.85)";
      ctx.textAlign = "left";
      ctx.fillText("频谱图", 10, 18);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [spectrum, width, height, pilotIndices, fftSize]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}
