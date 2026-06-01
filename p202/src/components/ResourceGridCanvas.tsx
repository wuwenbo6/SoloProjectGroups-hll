import { useRef, useEffect } from "react";
import { Complex } from "@/utils/fft";

interface Props {
  fftSize: number;
  numSymbols: number;
  pilotIndices: number[];
  freqDomainHistory: Complex[][];
  width: number;
  height: number;
}

const BG = "#0a0e1a";
const GRID_COLOR = "rgba(0,229,255,0.08)";
const RB_BOUNDARY_COLOR = "rgba(0,229,255,0.3)";
const LABEL_COLOR = "rgba(0,229,255,0.6)";
const PILOT_COLOR = "#ffab00";
const SUBFRAME_BOUNDARY_COLOR = "rgba(255,171,0,0.4)";

function getAmplitudeColor(amplitude: number, maxAmp: number): string {
  const intensity = Math.min(1, amplitude / maxAmp);
  const r = Math.floor(0 + intensity * 0);
  const g = Math.floor(20 + intensity * 229);
  const b = Math.floor(40 + intensity * 215);
  const a = 0.3 + intensity * 0.7;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export default function ResourceGridCanvas({
  fftSize,
  numSymbols,
  pilotIndices,
  freqDomainHistory,
  width,
  height,
}: Props) {
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
      const paddingLeft = 50;
      const paddingRight = 20;
      const paddingTop = 35;
      const paddingBottom = 35;

      const gridWidth = width - paddingLeft - paddingRight;
      const gridHeight = height - paddingTop - paddingBottom;

      const numSubcarriers = fftSize / 2;
      const displaySymbols = Math.min(14, numSymbols, freqDomainHistory.length);

      const cellWidth = gridWidth / displaySymbols;
      const cellHeight = gridHeight / numSubcarriers;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      const pilotSet = new Set(pilotIndices);

      let maxAmp = 1.0;
      for (let symIdx = 0; symIdx < displaySymbols; symIdx++) {
        const historyIdx = freqDomainHistory.length - displaySymbols + symIdx;
        if (historyIdx >= 0 && freqDomainHistory[historyIdx]) {
          for (let scIdx = 0; scIdx < numSubcarriers; scIdx++) {
            const fd = freqDomainHistory[historyIdx][scIdx];
            if (fd) {
              const amp = Math.sqrt(fd.re * fd.re + fd.im * fd.im);
              maxAmp = Math.max(maxAmp, amp);
            }
          }
        }
      }

      for (let symIdx = 0; symIdx < displaySymbols; symIdx++) {
        const historyIdx = freqDomainHistory.length - displaySymbols + symIdx;
        const x = paddingLeft + symIdx * cellWidth;

        for (let scIdx = 0; scIdx < numSubcarriers; scIdx++) {
          const y = paddingTop + (numSubcarriers - 1 - scIdx) * cellHeight;

          let fillColor = "rgba(10,14,26,0.8)";

          if (historyIdx >= 0 && freqDomainHistory[historyIdx]) {
            const fd = freqDomainHistory[historyIdx][scIdx];
            if (fd) {
              const amplitude = Math.sqrt(fd.re * fd.re + fd.im * fd.im);
              fillColor = getAmplitudeColor(amplitude, maxAmp);
            }
          }

          ctx.fillStyle = fillColor;
          ctx.fillRect(x, y, cellWidth, cellHeight);

          if (pilotSet.has(scIdx)) {
            ctx.fillStyle = PILOT_COLOR;
            ctx.font = `${Math.min(cellWidth, cellHeight) * 0.5}px "JetBrains Mono", monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("P", x + cellWidth / 2, y + cellHeight / 2);
          }
        }
      }

      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= displaySymbols; i++) {
        const x = paddingLeft + i * cellWidth;
        ctx.beginPath();
        ctx.moveTo(x, paddingTop);
        ctx.lineTo(x, paddingTop + gridHeight);
        ctx.stroke();
      }
      for (let i = 0; i <= numSubcarriers; i++) {
        const y = paddingTop + i * cellHeight;
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(paddingLeft + gridWidth, y);
        ctx.stroke();
      }

      ctx.strokeStyle = RB_BOUNDARY_COLOR;
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= numSubcarriers; i += 12) {
        const y = paddingTop + i * cellHeight;
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(paddingLeft + gridWidth, y);
        ctx.stroke();
      }

      ctx.strokeStyle = SUBFRAME_BOUNDARY_COLOR;
      ctx.lineWidth = 2;
      for (let i = 0; i <= displaySymbols; i += 14) {
        const x = paddingLeft + i * cellWidth;
        ctx.beginPath();
        ctx.moveTo(x, paddingTop);
        ctx.lineTo(x, paddingTop + gridHeight);
        ctx.stroke();
      }

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = "right";

      const rbCount = Math.ceil(numSubcarriers / 12);
      for (let i = 0; i < rbCount; i++) {
        const y = paddingTop + (i * 12 + 6) * cellHeight;
        ctx.fillText(`RB${rbCount - 1 - i}`, paddingLeft - 6, y + 4);
      }

      ctx.textAlign = "center";
      const labelStep = Math.max(1, Math.floor(displaySymbols / 7));
      for (let i = 0; i < displaySymbols; i += labelStep) {
        const x = paddingLeft + (i + 0.5) * cellWidth;
        ctx.fillText(String(i), x, height - paddingBottom + 15);
      }

      ctx.font = '12px "Noto Sans SC", sans-serif';
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = "center";
      ctx.fillText("OFDM 符号 (时间)", width / 2, height - 10);

      ctx.save();
      ctx.translate(15, height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("子载波 (频率)", 0, 0);
      ctx.restore();

      ctx.font = '13px "Noto Sans SC", sans-serif';
      ctx.fillStyle = "rgba(0,229,255,0.85)";
      ctx.textAlign = "left";
      ctx.fillText("时频资源格 (Resource Grid)", 10, 18);

      const legendX = width - 150;
      const legendY = 10;
      ctx.font = '10px "JetBrains Mono", monospace';

      ctx.fillStyle = PILOT_COLOR;
      ctx.textAlign = "left";
      ctx.fillText("P - 导频", legendX, legendY + 12);

      const gradient = ctx.createLinearGradient(legendX, legendY + 20, legendX + 80, legendY + 20);
      gradient.addColorStop(0, "rgba(0,20,40,0.3)");
      gradient.addColorStop(1, "rgba(0,229,255,1)");
      ctx.fillStyle = gradient;
      ctx.fillRect(legendX, legendY + 20, 80, 10);
      ctx.fillStyle = LABEL_COLOR;
      ctx.fillText("低", legendX + 85, legendY + 30);
      ctx.fillText("高", legendX - 15, legendY + 30);
      ctx.fillText("幅度", legendX + 30, legendY + 48);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fftSize, numSymbols, pilotIndices, freqDomainHistory, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}
