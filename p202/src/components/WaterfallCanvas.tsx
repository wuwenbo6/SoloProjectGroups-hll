import { useRef, useEffect } from "react";

interface Props {
  history: Float64Array[];
  width: number;
  height: number;
}

const BG = "#0a0e1a";
const LABEL_COLOR = "rgba(0,229,255,0.6)";

function heatColor(value: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, value));
  if (t < 0.25) {
    const s = t / 0.25;
    return [0, 0, Math.round(80 + 175 * s)];
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return [0, Math.round(255 * s), 255];
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return [Math.round(255 * s), 255, Math.round(255 * (1 - s))];
  } else {
    const s = (t - 0.75) / 0.25;
    return [255, Math.round(255 * (1 - s)), 0];
  }
}

export default function WaterfallCanvas({ history, width, height }: Props) {
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

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, width, height);

      if (history.length === 0) {
        ctx.font = '12px "Noto Sans SC", sans-serif';
        ctx.fillStyle = "rgba(0,229,255,0.4)";
        ctx.textAlign = "center";
        ctx.fillText("等待数据...", width / 2, height / 2);
        return;
      }

      const imageData = ctx.createImageData(plotW, plotH);
      const data = imageData.data;
      const numRows = history.length;
      const rowHeight = Math.max(1, Math.floor(plotH / Math.max(numRows, 1)));

      let maxVal = 0;
      for (const row of history) {
        for (let i = 0; i < row.length; i++) {
          if (row[i] > maxVal) maxVal = row[i];
        }
      }
      if (maxVal === 0) maxVal = 1;

      for (let rowIdx = 0; rowIdx < plotH; rowIdx++) {
        const dataRowIdx = Math.floor(rowIdx / rowHeight);
        const effectiveRow = Math.min(dataRowIdx, numRows - 1);
        const spectrum = history[effectiveRow];
        if (!spectrum) continue;

        for (let colIdx = 0; colIdx < plotW; colIdx++) {
          const freqIdx = Math.floor((colIdx / plotW) * spectrum.length);
          const val = spectrum[Math.min(freqIdx, spectrum.length - 1)] / maxVal;
          const [r, g, b] = heatColor(val);
          const pixelIdx = (rowIdx * plotW + colIdx) * 4;
          data[pixelIdx] = r;
          data[pixelIdx + 1] = g;
          data[pixelIdx + 2] = b;
          data[pixelIdx + 3] = 255;
        }
      }

      ctx.putImageData(imageData, padding, 10);

      ctx.strokeStyle = "rgba(0,229,255,0.15)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(padding, 10, plotW, plotH);

      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = "center";
      ctx.fillText("f (kHz)", width / 2, height - 3);

      ctx.font = '13px "Noto Sans SC", sans-serif';
      ctx.fillStyle = "rgba(0,229,255,0.85)";
      ctx.textAlign = "left";
      ctx.fillText("频谱瀑布图", 10, 18);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [history, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}
