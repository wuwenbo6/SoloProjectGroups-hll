import { useRef, useEffect, useState } from "react";
import { Complex } from "@/utils/fft";
import { ModulationType, getBitsPerSymbol } from "@/utils/signal";

interface Props {
  fftSize: number;
  pilotInterval: number;
  numRb: number;
  pilotIndices: number[];
  freqDomain?: Complex[][];
  modulation: ModulationType;
  width: number;
  height: number;
}

const BG = "#0a0e1a";
const GRID_COLOR = "rgba(0,229,255,0.1)";
const GRID_LINE_COLOR = "rgba(0,229,255,0.2)";
const LABEL_COLOR = "rgba(0,229,255,0.6)";
const PILOT_COLOR = "#ffab00";
const DC_COLOR = "#7c4dff";
const DATA_COLOR = "#00e5ff";
const UNUSED_COLOR = "#1a1f2e";

export default function ResourceGrid({
  fftSize,
  pilotInterval,
  numRb,
  pilotIndices,
  freqDomain,
  modulation,
  width,
  height,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [hoverInfo, setHoverInfo] = useState<string | null>(null);

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

      const half = fftSize / 2;
      const numSubcarriers = half;
      const numSymbols = numRb;

      const cellWidth = gridWidth / numSubcarriers;
      const cellHeight = gridHeight / numSymbols;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      const pilotSet = new Set(pilotIndices);

      for (let symIdx = 0; symIdx < numSymbols; symIdx++) {
        for (let scIdx = 0; scIdx < numSubcarriers; scIdx++) {
          const x = paddingLeft + scIdx * cellWidth;
          const y = paddingTop + symIdx * cellHeight;

          let fillColor = UNUSED_COLOR;
          let hasData = false;

          if (scIdx === 0) {
            fillColor = DC_COLOR;
          } else if (pilotSet.has(scIdx)) {
            fillColor = PILOT_COLOR;
          } else if (scIdx % pilotInterval !== 1 && scIdx !== 1) {
            hasData = true;
            if (freqDomain && freqDomain[symIdx]) {
              const fd = freqDomain[symIdx][scIdx];
              const amplitude = Math.sqrt(fd.re * fd.re + fd.im * fd.im);
              const maxAmp = modulation === "64QAM" ? 2.5 : modulation === "16QAM" ? 1.5 : 1.0;
              const intensity = Math.min(1, amplitude / maxAmp);
              const r = parseInt(DATA_COLOR.slice(1, 3), 16);
              const g = parseInt(DATA_COLOR.slice(3, 5), 16);
              const b = parseInt(DATA_COLOR.slice(5, 7), 16);
              const alpha = 0.3 + intensity * 0.7;
              fillColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            } else {
              fillColor = DATA_COLOR;
            }
          }

          ctx.fillStyle = fillColor;
          ctx.fillRect(x, y, cellWidth, cellHeight);

          if (hasData && cellWidth > 8 && cellHeight > 8) {
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x, y, cellWidth, cellHeight);
          }
        }
      }

      ctx.strokeStyle = GRID_LINE_COLOR;
      ctx.lineWidth = 1;

      for (let i = 0; i <= numSubcarriers; i++) {
        const x = paddingLeft + i * cellWidth;
        ctx.beginPath();
        ctx.moveTo(x, paddingTop);
        ctx.lineTo(x, paddingTop + gridHeight);
        ctx.stroke();
      }

      for (let i = 0; i <= numSymbols; i++) {
        const y = paddingTop + i * cellHeight;
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(paddingLeft + gridWidth, y);
        ctx.stroke();
      }

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = "center";

      const labelStep = Math.max(1, Math.floor(numSubcarriers / 8));
      for (let i = 0; i < numSubcarriers; i += labelStep) {
        const x = paddingLeft + (i + 0.5) * cellWidth;
        ctx.fillText(String(i), x, height - paddingBottom + 15);
      }

      ctx.textAlign = "right";
      const rbLabelStep = Math.max(1, Math.floor(numSymbols / 6));
      for (let i = 0; i < numSymbols; i += rbLabelStep) {
        const y = paddingTop + (i + 0.5) * cellHeight + 4;
        ctx.fillText(`RB${i}`, paddingLeft - 6, y);
      }

      ctx.font = '12px "Noto Sans SC", sans-serif';
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = "center";
      ctx.fillText("子载波 (频率)", width / 2, height - 10);

      ctx.save();
      ctx.translate(15, height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("OFDM 符号 (时间)", 0, 0);
      ctx.restore();

      ctx.font = '13px "Noto Sans SC", sans-serif';
      ctx.fillStyle = "rgba(0,229,255,0.85)";
      ctx.textAlign = "left";
      ctx.fillText("时频资源网格", 10, 18);

      const legendX = width - 180;
      const legendY = 10;
      ctx.font = '10px "JetBrains Mono", monospace';

      const drawLegendItem = (x: number, y: number, color: string, label: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 12, 12);
        ctx.strokeStyle = GRID_LINE_COLOR;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, 12, 12);
        ctx.fillStyle = LABEL_COLOR;
        ctx.textAlign = "left";
        ctx.fillText(label, x + 18, y + 10);
      };

      drawLegendItem(legendX, legendY, DC_COLOR, "DC");
      drawLegendItem(legendX + 50, legendY, PILOT_COLOR, "导频");
      drawLegendItem(legendX + 100, legendY, DATA_COLOR, "数据");
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fftSize, pilotInterval, numRb, pilotIndices, freqDomain, modulation, width, height]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !freqDomain) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const paddingLeft = 50;
    const paddingTop = 35;
    const paddingRight = 20;
    const paddingBottom = 35;

    const gridWidth = width - paddingLeft - paddingRight;
    const gridHeight = height - paddingTop - paddingBottom;

    const half = fftSize / 2;
    const cellWidth = gridWidth / half;
    const cellHeight = gridHeight / numRb;

    const scIdx = Math.floor((x - paddingLeft) / cellWidth);
    const symIdx = Math.floor((y - paddingTop) / cellHeight);

    if (scIdx >= 0 && scIdx < half && symIdx >= 0 && symIdx < numRb) {
      const fd = freqDomain[symIdx]?.[scIdx];
      const pilotSet = new Set(pilotIndices);
      let type = "未使用";
      if (scIdx === 0) type = "DC";
      else if (pilotSet.has(scIdx)) type = "导频";
      else if (scIdx % pilotInterval !== 1 && scIdx !== 1) type = "数据";

      if (fd) {
        const amplitude = Math.sqrt(fd.re * fd.re + fd.im * fd.im);
        const phase = Math.atan2(fd.im, fd.re) * 180 / Math.PI;
        setHoverInfo(
          `RB${symIdx}, SC${scIdx} [${type}] | Amp: ${amplitude.toFixed(3)} | Phase: ${phase.toFixed(1)}°`
        );
      } else {
        setHoverInfo(`RB${symIdx}, SC${scIdx} [${type}]`);
      }
    } else {
      setHoverInfo(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {hoverInfo && (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black/80 px-3 py-1 rounded text-xs font-mono text-cyan-300 border border-cyan-700/40">
          {hoverInfo}
        </div>
      )}
    </div>
  );
}
