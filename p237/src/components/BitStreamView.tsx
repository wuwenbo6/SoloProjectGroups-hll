import { useRef, useEffect, useCallback } from 'react';

interface BitStreamViewProps {
  bits: Float64Array;
  width: number;
  height: number;
  maxBits?: number;
}

export default function BitStreamView({ bits, width, height, maxBits = 400 }: BitStreamViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || bits.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pad = { top: 12, right: 16, bottom: 20, left: 52 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    ctx.fillStyle = '#0c1222';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.lineWidth = 1;
    const y0 = pad.top + plotH / 2;
    const y1 = pad.top;
    const ym1 = pad.top + plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y0);
    ctx.lineTo(pad.left + plotW, y0);
    ctx.stroke();

    const step = Math.max(1, Math.floor(bits.length / maxBits));
    const displayCount = Math.floor(bits.length / step);

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < displayCount; i++) {
      const x = pad.left + (i / displayCount) * plotW;
      const bit = bits[i * step];
      const y = bit >= 0 ? y1 + 4 : ym1 - 4;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevBit = bits[(i - 1) * step];
        if (prevBit !== bit) {
          const prevY = prevBit >= 0 ? y1 + 4 : ym1 - 4;
          ctx.lineTo(x, prevY);
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('+1', pad.left - 6, y1 + 10);
    ctx.fillText(' 0', pad.left - 6, y0 + 3);
    ctx.fillText('-1', pad.left - 6, ym1 - 2);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#10b981';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('Δ-Σ Output Bitstream', pad.left + 4, pad.top - 2);

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);
  }, [bits, width, height, maxBits]);

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
