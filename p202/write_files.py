#!/usr/bin/env python3
import os

base = '/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p202/src'

files = {}

files['components/ConstellationCanvas.tsx'] = '''import { useRef, useEffect } from "react";
import { Complex } from "@/utils/fft";

interface Props {
  symbols: Complex[] | null;
  width: number;
  height: number;
}

const BG = "#0a0e1a";
const GRID_COLOR = "rgba(0,229,255,0.08)";
const AXIS_COLOR = "rgba(0,229,255,0.25)";
const LABEL_COLOR = "rgba(0,229,255,0.6)";
const CROSS_COLOR = "rgba(255,255,255,0.2)";

const IDEAL_QPSK: Complex[] = [
  { re: Math.SQRT1_2, im: Math.SQRT1_2 },
  { re: -Math.SQRT1_2, im: Math.SQRT1_2 },
  { re: Math.SQRT1_2, im: -Math.SQRT1_2 },
  { re: -Math.SQRT1_2, im: -Math.SQRT1_2 },
];

function getQuadrantColor(s: Complex): string {
  if (s.re >= 0 && s.im >= 0) return "#00e5ff";
  if (s.re < 0 && s.im >= 0) return "#7c4dff";
  if (s.re < 0 && s.im < 0) return "#ff5252";
  return "#ffab00";
}

function drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.stroke();
}

export default function ConstellationCanvas({ symbols, width, height }: Props) {
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

      ctx.strokeStyle = CROSS_COLOR;
      ctx.lineWidth = 1;
      for (const p of IDEAL_QPSK) {
        const x = cx + p.re * plotSize;
        const y = cy - p.im * plotSize;
        drawCross(ctx, x, y, 5);
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
      ctx.fillText("\\u661F\\u5EA7\\u56FE", 10, 18);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [symbols, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}
'''

files['components/WaterfallCanvas.tsx'] = '''import { useRef, useEffect } from "react";

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
        ctx.fillText("\\u7B49\\u5F85\\u6570\\u636E...", width / 2, height / 2);
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
      ctx.fillText("\\u9891\\u8C31\\u7011\\u5E03\\u56FE", 10, 18);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [history, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}
'''

files['components/WaveformCanvas.tsx'] = '''import { useRef, useEffect } from "react";
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
      ctx.fillText("\\u65F6\\u57DF\\u6CE2\\u5F62", 10, 18);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [signal, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}
'''

files['components/SpectrumCanvas.tsx'] = '''import { useRef, useEffect } from "react";

interface Props {
  spectrum: Float64Array | null;
  width: number;
  height: number;
}

const BG = "#0a0e1a";
const GRID_COLOR = "rgba(0,229,255,0.06)";
const AXIS_COLOR = "rgba(0,229,255,0.2)";
const CYAN = "#00e5ff";
const FILL_COLOR = "rgba(0,229,255,0.12)";

export default function SpectrumCanvas({ spectrum, width, height }: Props) {
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

      for (let i = 0; i <= 8; i++) {
        const x = padding + (i / 8) * plotW;
        const y = 10 + (i / 8) * plotH;
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x, baseY);
        ctx.stroke();
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

      if (spectrum && spectrum.length > 0) {
        const half = Math.floor(spectrum.length / 2);
        let maxVal = 0;
        for (let i = 0; i < half; i++) {
          if (spectrum[i] > maxVal) maxVal = spectrum[i];
        }
        if (maxVal === 0) maxVal = 1;

        ctx.beginPath();
        ctx.moveTo(padding, baseY);
        for (let i = 0; i < half; i++) {
          const x = padding + (i / half) * plotW;
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
        for (let i = 0; i < half; i++) {
          const x = padding + (i / half) * plotW;
          const val = spectrum[i] / maxVal;
          const y = baseY - val * plotH * 0.85;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(0,229,255,0.5)";
      ctx.textAlign = "center";
      ctx.fillText("f (subcarrier)", width / 2, height - 3);

      ctx.font = '13px "Noto Sans SC", sans-serif';
      ctx.fillStyle = "rgba(0,229,255,0.85)";
      ctx.textAlign = "left";
      ctx.fillText("\\u9891\\u8C31\\u56FE", 10, 18);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [spectrum, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}
'''

files['components/ControlPanel.tsx'] = '''import { useSignalStore } from "@/store/signalStore";

const FFT_OPTIONS = [16, 32, 64, 128, 256];

export default function ControlPanel() {
  const { params, result, isRunning, setParams, generate, startContinuous, stopContinuous } =
    useSignalStore();

  const maxSymbols = Math.floor(params.fftSize / 2) - 1;

  return (
    <div className="flex flex-col gap-5 p-4 h-full overflow-y-auto">
      <h2 className="text-sm font-bold tracking-wider text-cyan-300 uppercase">
        OFDM \u53C2\u6570\u63A7\u5236
      </h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-cyan-400/70">FFT \u5927\u5C0F</label>
        <select
          value={params.fftSize}
          onChange={(e) => {
            const v = Number(e.target.value);
            setParams({ fftSize: v, numSymbols: Math.min(params.numSymbols, Math.floor(v / 2) - 1) });
          }}
          className="bg-[#111827] border border-cyan-900/40 rounded px-2 py-1.5 text-sm text-cyan-100 font-mono focus:outline-none focus:border-cyan-500/60"
        >
          {FFT_OPTIONS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-cyan-400/70">
          CP \u957F\u5EA6: <span className="font-mono text-cyan-200">{params.cpLength}</span>
        </label>
        <input
          type="range"
          min={1}
          max={64}
          value={params.cpLength}
          onChange={(e) => setParams({ cpLength: Number(e.target.value) })}
          className="w-full accent-cyan-500 h-1"
        />
        <input
          type="number"
          min={1}
          max={64}
          value={params.cpLength}
          onChange={(e) => setParams({ cpLength: Math.max(1, Math.min(64, Number(e.target.value))) })}
          className="bg-[#111827] border border-cyan-900/40 rounded px-2 py-1 text-sm text-cyan-100 font-mono w-20 focus:outline-none focus:border-cyan-500/60"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-cyan-400/70">
          SNR (dB): <span className="font-mono text-cyan-200">{params.snrDb}</span>
        </label>
        <input
          type="range"
          min={-5}
          max={40}
          step={0.5}
          value={params.snrDb}
          onChange={(e) => setParams({ snrDb: Number(e.target.value) })}
          className="w-full accent-cyan-500 h-1"
        />
        <input
          type="number"
          min={-5}
          max={40}
          step={0.5}
          value={params.snrDb}
          onChange={(e) => setParams({ snrDb: Math.max(-5, Math.min(40, Number(e.target.value))) })}
          className="bg-[#111827] border border-cyan-900/40 rounded px-2 py-1 text-sm text-cyan-100 font-mono w-20 focus:outline-none focus:border-cyan-500/60"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-cyan-400/70">
          \u6570\u636E\u5B50\u8F7D\u6CE2\u6570: <span className="font-mono text-cyan-200">{params.numSymbols}</span>
        </label>
        <input
          type="range"
          min={1}
          max={maxSymbols}
          value={params.numSymbols}
          onChange={(e) => setParams({ numSymbols: Number(e.target.value) })}
          className="w-full accent-cyan-500 h-1"
        />
        <input
          type="number"
          min={1}
          max={maxSymbols}
          value={params.numSymbols}
          onChange={(e) => setParams({ numSymbols: Math.max(1, Math.min(maxSymbols, Number(e.target.value))) })}
          className="bg-[#111827] border border-cyan-900/40 rounded px-2 py-1 text-sm text-cyan-100 font-mono w-20 focus:outline-none focus:border-cyan-500/60"
        />
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <button
          onClick={generate}
          className="w-full py-2 rounded bg-cyan-600/20 border border-cyan-500/40 text-cyan-200 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
        >
          \u751F\u6210\u4FE1\u53F7
        </button>
        <button
          onClick={isRunning ? stopContinuous : startContinuous}
          className={`w-full py-2 rounded border text-sm font-medium transition-colors ${
            isRunning
              ? "bg-red-600/20 border-red-500/40 text-red-300 hover:bg-red-500/30"
              : "bg-amber-600/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30"
          }`}
        >
          {isRunning ? "\u505C\u6B62\u8FD0\u884C" : "\u8FDE\u7EED\u8FD0\u884C"}
        </button>
      </div>

      <div className="mt-3 p-3 rounded bg-[#111827] border border-cyan-900/30">
        <div className="text-xs text-cyan-400/60 mb-1">BER (\u8BEF\u7801\u7387)</div>
        <div className="text-xl font-mono font-bold text-cyan-300">
          {result ? result.ber.toFixed(6) : "---"}
        </div>
      </div>
    </div>
  );
}
'''

files['pages/Home.tsx'] = '''import { useSignalStore } from "@/store/signalStore";
import ControlPanel from "@/components/ControlPanel";
import WaveformCanvas from "@/components/WaveformCanvas";
import SpectrumCanvas from "@/components/SpectrumCanvas";
import ConstellationCanvas from "@/components/ConstellationCanvas";
import WaterfallCanvas from "@/components/WaterfallCanvas";

export default function Home() {
  const { result, waterfallHistory } = useSignalStore();

  return (
    <div className="flex h-screen w-screen bg-[#0a0e1a]">
      <aside className="w-[280px] min-w-[280px] h-full bg-[#0d1225] border-r border-cyan-900/20">
        <ControlPanel />
      </aside>
      <main className="flex-1 p-3 grid grid-cols-2 grid-rows-2 gap-3 h-full">
        <div className="rounded-lg border border-cyan-900/20 bg-[#0d1225] overflow-hidden">
          <WaveformCanvas signal={result?.rxSignal ?? null} width={600} height={300} />
        </div>
        <div className="rounded-lg border border-cyan-900/20 bg-[#0d1225] overflow-hidden">
          <SpectrumCanvas spectrum={result?.spectrum ?? null} width={600} height={300} />
        </div>
        <div className="rounded-lg border border-cyan-900/20 bg-[#0d1225] overflow-hidden">
          <ConstellationCanvas symbols={result?.rxSymbols ?? null} width={600} height={300} />
        </div>
        <div className="rounded-lg border border-cyan-900/20 bg-[#0d1225] overflow-hidden">
          <WaterfallCanvas history={waterfallHistory} width={600} height={300} />
        </div>
      </main>
    </div>
  );
}
'''

for path, content in files.items():
    full_path = os.path.join(base, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        # Decode unicode escapes for Chinese characters
        content = content.replace('\\u661F\\u5EA7\\u56FE', '星座图')
        content = content.replace('\\u7B49\\u5F85\\u6570\\u636E...', '等待数据...')
        content = content.replace('\\u9891\\u8C31\\u7011\\u5E03\\u56FE', '频谱瀑布图')
        content = content.replace('\\u65F6\\u57DF\\u6CE2\\u5F62', '时域波形')
        content = content.replace('\\u9891\\u8C31\\u56FE', '频谱图')
        content = content.replace('\\u53C2\\u6570\\u63A7\\u5236', '参数控制')
        content = content.replace('\\u5927\\u5C0F', '大小')
        content = content.replace('\\u957F\\u5EA6', '长度')
        content = content.replace('\\u6570\\u636E\\u5B50\\u8F7D\\u6CE2\\u6570', '数据子载波数')
        content = content.replace('\\u751F\\u6210\\u4FE1\\u53F7', '生成信号')
        content = content.replace('\\u505C\\u6B62\\u8FD0\\u884C', '停止运行')
        content = content.replace('\\u8FDE\\u7EED\\u8FD0\\u884C', '连续运行')
        content = content.replace('\\u8BEF\\u7801\\u7387', '误码率')
        f.write(content)
    print(f'Written: {path}')

print('All component files written!')
