import React, { useMemo } from 'react';
import { useSimulationStore, useAPIService } from '../store/useSimulationStore';
import { Download } from 'lucide-react';

export const SavingCurve: React.FC = () => {
  const state = useSimulationStore((s) => s.state);
  const api = useAPIService();

  const { curve, width, height, padding, maxTime, maxRatio } = useMemo(() => {
    const savingCurve = state?.savingCurve || [];
    if (savingCurve.length < 2) {
      return { curve: savingCurve, width: 600, height: 200, padding: 40, maxTime: 10000, maxRatio: 1 };
    }

    const w = 600;
    const h = 200;
    const p = 40;
    const mt = Math.max(...savingCurve.map((p) => p.time), 1000);
    const mr = Math.max(...savingCurve.map((p) => p.overallSavingRatio), 0.1);

    return { curve: savingCurve, width: w, height: h, padding: p, maxTime: mt, maxRatio: mr };
  }, [state?.savingCurve]);

  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const overallPath = useMemo(() => {
    if (curve.length < 2) return '';
    return curve
      .map((point, i) => {
        const x = padding + (point.time / maxTime) * chartWidth;
        const y = height - padding - (point.overallSavingRatio / maxRatio) * chartHeight;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [curve, maxTime, maxRatio, chartWidth, chartHeight, padding, height]);

  const staPaths = useMemo(() => {
    if (curve.length < 2 || !state?.stas) return {};
    const paths: Record<string, string> = {};
    for (const sta of state.stas) {
      const path = curve
        .map((point, i) => {
          const ratio = point.staSavingRatios[sta.id] ?? 0;
          const x = padding + (point.time / maxTime) * chartWidth;
          const y = height - padding - (ratio / maxRatio) * chartHeight;
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ');
      paths[sta.id] = path;
    }
    return paths;
  }, [curve, maxTime, maxRatio, chartWidth, chartHeight, padding, height, state?.stas]);

  const yAxisLabels = useMemo(() => {
    const labels = [];
    for (let i = 0; i <= 5; i++) {
      const ratio = (maxRatio * i) / 5;
      const y = height - padding - (ratio / maxRatio) * chartHeight;
      labels.push({ value: `${(ratio * 100).toFixed(0)}%`, y });
    }
    return labels;
  }, [maxRatio, height, padding, chartHeight]);

  const xAxisLabels = useMemo(() => {
    const labels = [];
    for (let i = 0; i <= 5; i++) {
      const time = (maxTime * i) / 5;
      const x = padding + (time / maxTime) * chartWidth;
      const label = time >= 1000 ? `${(time / 1000).toFixed(1)}s` : `${time.toFixed(0)}ms`;
      labels.push({ value: label, x });
    }
    return labels;
  }, [maxTime, chartWidth, padding]);

  if (curve.length < 2) {
    return (
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">节电比率曲线</h3>
        <div className="text-center py-8 text-slate-500">
          启动模拟后将显示节电比率曲线
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-100">节电比率曲线</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => api.exportCurve('csv')}
            className="text-sm px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
          <button
            onClick={() => api.exportCurve('json')}
            className="text-sm px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            JSON
          </button>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#475569"
          strokeWidth={1}
        />
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="#475569"
          strokeWidth={1}
        />

        {yAxisLabels.map((label, i) => (
          <g key={`y-${i}`}>
            <text
              x={padding - 8}
              y={label.y + 4}
              textAnchor="end"
              className="fill-slate-400"
              fontSize={10}
            >
              {label.value}
            </text>
            <line
              x1={padding}
              y1={label.y}
              x2={width - padding}
              y2={label.y}
              stroke="#334155"
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
          </g>
        ))}

        {xAxisLabels.map((label, i) => (
          <text
            key={`x-${i}`}
            x={label.x}
            y={height - padding + 16}
            textAnchor="middle"
            className="fill-slate-400"
            fontSize={10}
          >
            {label.value}
          </text>
        ))}

        {state?.stas?.map((sta) =>
          staPaths[sta.id] ? (
            <path
              key={sta.id}
              d={staPaths[sta.id]}
              fill="none"
              stroke={sta.color}
              strokeWidth={1}
              opacity={0.4}
            />
          ) : null
        )}

        <path
          d={overallPath}
          fill="none"
          stroke="#06b6d4"
          strokeWidth={2.5}
        />

        {curve.length > 0 && (
          <circle
            cx={padding + (curve[curve.length - 1].time / maxTime) * chartWidth}
            cy={height - padding - (curve[curve.length - 1].overallSavingRatio / maxRatio) * chartHeight}
            r={4}
            fill="#06b6d4"
          />
        )}
      </svg>

      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-cyan-500" />
          <span>总体节能比</span>
        </div>
        {state?.stas?.slice(0, 4).map((sta) => (
          <div key={sta.id} className="flex items-center gap-1">
            <div className="w-4 h-0.5" style={{ backgroundColor: sta.color, opacity: 0.5 }} />
            <span>{sta.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
