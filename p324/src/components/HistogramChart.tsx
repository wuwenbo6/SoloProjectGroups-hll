import { useMemo } from "react";
import { useDicomStore } from "@/store/useDicomStore";

export default function HistogramChart() {
  const { result, customWindow } = useDicomStore();

  const chartData = useMemo(() => {
    if (!result) return null;
    const { bins, counts } = result.histogram;
    const maxCount = Math.max(...counts, 1);
    const windowCenter = customWindow?.center ?? result.optimized_window.center;
    const windowWidth = customWindow?.width ?? result.optimized_window.width;
    const lower = windowCenter - windowWidth / 2;
    const upper = windowCenter + windowWidth / 2;

    const minBin = bins[0];
    const maxBin = bins[bins.length - 1];
    const range = maxBin - minBin || 1;

    return {
      bars: bins.map((bin, i) => ({
        x: ((bin - minBin) / range) * 100,
        height: (counts[i] / maxCount) * 100,
        inWindow: bin >= lower && bin <= upper,
        count: counts[i],
        bin,
      })),
      lowerPct: ((lower - minBin) / range) * 100,
      upperPct: ((upper - minBin) / range) * 100,
      centerPct: ((windowCenter - minBin) / range) * 100,
      lower,
      upper,
      windowCenter,
    };
  }, [result, customWindow]);

  if (!chartData) return null;

  const barWidth = 100 / chartData.bars.length;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-fg-secondary">像素值直方图</h3>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-accent/40" />
            <span className="text-fg-muted">窗内范围</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-fg-muted/30" />
            <span className="text-fg-muted">窗外范围</span>
          </span>
        </div>
      </div>

      <div className="relative h-48">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00D4AA" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#00D4AA" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="barDimGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6E7681" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#6E7681" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {chartData.bars.map((bar, i) => (
            <rect
              key={i}
              x={bar.x - barWidth / 2}
              y={100 - bar.height}
              width={Math.max(barWidth * 0.9, 0.3)}
              height={Math.max(bar.height, 0.1)}
              fill={bar.inWindow ? "url(#barGrad)" : "url(#barDimGrad)"}
              rx="0.2"
            />
          ))}

          <line
            x1={chartData.centerPct}
            y1="0"
            x2={chartData.centerPct}
            y2="100"
            stroke="#00D4AA"
            strokeWidth="0.3"
            strokeDasharray="1,1"
          />

          <line
            x1={chartData.lowerPct}
            y1="0"
            x2={chartData.lowerPct}
            y2="100"
            stroke="#00FFD0"
            strokeWidth="0.2"
            strokeDasharray="0.5,0.5"
            opacity="0.6"
          />
          <line
            x1={chartData.upperPct}
            y1="0"
            x2={chartData.upperPct}
            y2="100"
            stroke="#00FFD0"
            strokeWidth="0.2"
            strokeDasharray="0.5,0.5"
            opacity="0.6"
          />
        </svg>

        <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] font-mono text-fg-muted mt-1 px-1">
          <span>{chartData.lower.toFixed(0)}</span>
          <span className="text-accent">WL: {chartData.windowCenter.toFixed(1)}</span>
          <span>{chartData.upper.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}
