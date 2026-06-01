import { useRef, useEffect } from "react";
import { Complex } from "@/utils/fft";
import { ModulationFormat, getIdealConstellationPoints } from "@/utils/signal";

interface Props {
  symbols: Complex[] | null;
  width: number;
  height: number;
  modulationFormat?: ModulationFormat;
}

const BG = "#0a0e1a";
const GRID_COLOR = "rgba(0,229,255,0.08)";
const AXIS_COLOR = "rgba(0,229,255,0.25)";
const LABEL_COLOR = "rgba(0,229,255,0.6)";
const IDEAL_POINT_COLOR = "rgba(255,255,255,0.5)";

function getQuadrantColor(s: Complex): string {
  if (s.re >= 0 && s.im >= 0) return "#00e5ff";
  if (s.re < 0 && s.im >= 0) return "#7c4dff";
  if (s.re < 0 && s.im < 0) return "#ff5252";
  return "#ffab00";
}

function getModulationLabel(format?: ModulationFormat): string {
  switch (format) {
    case 'qpsk': return 'QPSK';
    case '16qam': return '16QAM';
    case '64qam': return '64QAM';
    default: return 'QPSK';
  }
}

export default function ConstellationCanvas({ symbols, width, height, modulationFormat = 'qpsk' }: Props) {
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

    const idealPoints = getIdealConstellationPoints(modulationFormat);

    const draw = () => {
      const cx = width / 2;
      const cy = height / 2;
      const plotSize = Math.min(width, height) * 0.38;
      const padding = 30;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      for (let i = -4; i <= 4; i++) {
        const offset = (i / 4) * plotSize;
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(cx + offset, padding);
        ctx.lineTo(cx + offset, height - padding);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(padding, cy + offset);
        ctx.lineTo(width - padding, cy + offset);
        ctx.stroke();
      }

      ctx.strokeStyle = AXIS_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, cy);
      ctx.lineTo(width - padding, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, padding);
      ctx.lineTo(cx, height - padding);
      ctx.stroke();

      ctx.fillStyle = IDEAL_POINT_COLOR;
      for (const p of idealPoints) {
        const x = cx + p.re * plotSize;
        const y = cy - p.im * plotSize;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      if (symbols && symbols.length > 0) {
        for (const s of symbols) {
          const x = cx + s.re * plotSize;
          const y = cy - s.im * plotSize;
          if (x < padding || x > width - padding || y < padding || y > height - padding) continue;
          ctx.fillStyle = getQuadrantColor(s);
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = "center";
      ctx.fillText("I", width - padding + 12, cy + 4);
      ctx.fillText("Q", cx, padding - 10);

      ctx.font = '13px "Noto Sans SC", sans-serif';
      ctx.fillStyle = "rgba(0,229,255,0.85)";
      ctx.textAlign = "left";
      ctx.fillText("星座图", 10, 18);

      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.textAlign = "right";
      ctx.fillText(getModulationLabel(modulationFormat), width - 10, 18);

      const legendX = width - 120;
      const legendY = height - 25;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = IDEAL_POINT_COLOR;
      ctx.beginPath();
      ctx.arc(legendX, legendY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = "left";
      ctx.fillText("理想点", legendX + 8, legendY + 4);

      ctx.fillStyle = "#00e5ff";
      ctx.beginPath();
      ctx.arc(legendX + 60, legendY, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = LABEL_COLOR;
      ctx.fillText("接收点", legendX + 68, legendY + 4);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [symbols, width, height, modulationFormat]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}
