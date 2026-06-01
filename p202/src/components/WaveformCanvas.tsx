import { useRef, useEffect } from "react";
import { Complex } from "@/utils/fft";

interface Props {
  signal: Complex[] | null;
  width: number;
  height: number;
}

const BG = "#0a0e1a";
const GRID_COLOR = "rgba(0,229,255,0.06)";
const AXIS_COLOR = "rgba(0,229,255,0.2)";
const CYAN = "#00e5ff";
const AMBER = "#ffab00";
const CP_COLOR = "rgba(255,171,0,0.08)";

export default function WaveformCanvas({ signal, width, height }: Props) {
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
      const midY = 10 + plotH / 2;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i <= 8; i++) {
        const x = padding + (i / 8) * plotW;
        const y = 10 + (i / 8) * plotH;
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x, 10 + plotH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(padding + plotW, y);
        ctx.stroke();
      }

      ctx.strokeStyle = AXIS_COLOR;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(padding, midY);
      ctx.lineTo(padding + plotW, midY);
      ctx.stroke();

      if (signal && signal.length > 0) {
        const cpLen = Math.floor(signal.length * 0.2);
        const cpX = padding;
        const cpW = (cpLen / signal.length) * plotW;
        ctx.fillStyle = CP_COLOR;
        ctx.fillRect(cpX, 10, cpW, plotH);

        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = "rgba(255,171,0,0.5)";
        ctx.textAlign = "center";
        ctx.fillText("CP", cpX + cpW / 2, 22);

        let maxAmp = 0;
        for (const s of signal) {
          const amp = Math.max(Math.abs(s.re), Math.abs(s.im));
          if (amp > maxAmp) maxAmp = amp;
        }
        if (maxAmp === 0) maxAmp = 1;

        const drawLine = (getVal: (s: Complex) => number, color: string) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let i = 0; i < signal.length; i++) {
            const x = padding + (i / signal.length) * plotW;
            const val = getVal(signal[i]) / maxAmp;
            const y = midY - val * (plotH / 2) * 0.85;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        };

        drawLine((s) => s.re, CYAN);
        drawLine((s) => s.im, AMBER);
      }

      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(0,229,255,0.5)";
      ctx.textAlign = "center";
      ctx.fillText("t (samples)", width / 2, height - 3);

      if (signal && signal.length > 0) {
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.fillStyle = CYAN;
        ctx.fillText("I", padding + plotW - 30, 20);
        ctx.fillStyle = AMBER;
        ctx.fillText("Q", padding + plotW - 12, 20);
      }

      ctx.font = '13px "Noto Sans SC", sans-serif';
      ctx.fillStyle = "rgba(0,229,255,0.85)";
      ctx.textAlign = "left";
      ctx.fillText("时域波形", 10, 18);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [signal, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}
