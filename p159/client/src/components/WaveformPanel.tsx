import React, { useRef, useEffect, useState } from 'react';

interface WaveformPanelProps {
  data: string;
  onDataChange: (data: string) => void;
}

export const WaveformPanel: React.FC<WaveformPanelProps> = ({ data, onDataChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showStats, setShowStats] = useState(true);

  const parseData = (raw: string): number[] => {
    try {
      return raw
        .trim()
        .split(',')
        .map((s) => parseFloat(s.trim()))
        .filter((v) => !isNaN(v));
    } catch {
      return [];
    }
  };

  const calculateStats = (values: number[]) => {
    if (values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const peakToPeak = max - min;
    return { min, max, mean, stdDev, peakToPeak, count: values.length };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const values = parseData(data);
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = 40;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    if (values.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('没有波形数据', width / 2, height / 2);
      return;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (plotHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    values.forEach((value, index) => {
      const x = padding + (index / (values.length - 1 || 1)) * plotWidth;
      const y = padding + plotHeight - ((value - min) / range) * plotHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(max.toExponential(2), padding - 8, padding + 5);
    ctx.fillText(min.toExponential(2), padding - 8, height - padding + 5);
    ctx.fillText(((max + min) / 2).toExponential(2), padding - 8, height / 2);

    ctx.textAlign = 'center';
    ctx.fillText('0', padding, height - padding + 15);
    ctx.fillText(values.length.toString(), width - padding, height - padding + 15);
  }, [data]);

  const exportToCsv = () => {
    const values = parseData(data);
    if (values.length === 0) {
      alert('没有可导出的波形数据');
      return;
    }

    const csvContent = [
      'Index,Time,Voltage',
      ...values.map((v, i) => `${i},${i * 1e-6},${v.toExponential(6)}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `waveform_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stats = calculateStats(parseData(data));

  return (
    <div className="bg-slate-800 rounded-xl p-6 shadow-lg border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">波形显示</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowStats(!showStats)}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
              showStats
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            统计信息
          </button>
          <button
            onClick={exportToCsv}
            disabled={!data}
            className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
          >
            导出CSV
          </button>
        </div>
      </div>

      {showStats && stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-slate-900/50 p-3 rounded-lg">
            <p className="text-xs text-slate-400">数据点数</p>
            <p className="text-lg font-mono text-white">{stats.count}</p>
          </div>
          <div className="bg-slate-900/50 p-3 rounded-lg">
            <p className="text-xs text-slate-400">最小值</p>
            <p className="text-lg font-mono text-blue-400">{stats.min.toExponential(3)}</p>
          </div>
          <div className="bg-slate-900/50 p-3 rounded-lg">
            <p className="text-xs text-slate-400">最大值</p>
            <p className="text-lg font-mono text-green-400">{stats.max.toExponential(3)}</p>
          </div>
          <div className="bg-slate-900/50 p-3 rounded-lg">
            <p className="text-xs text-slate-400">峰峰值</p>
            <p className="text-lg font-mono text-yellow-400">{stats.peakToPeak.toExponential(3)}</p>
          </div>
          <div className="bg-slate-900/50 p-3 rounded-lg">
            <p className="text-xs text-slate-400">平均值</p>
            <p className="text-lg font-mono text-purple-400">{stats.mean.toExponential(3)}</p>
          </div>
        </div>
      )}

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg bg-slate-900"
          style={{ height: '300px' }}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-slate-400">原始数据</label>
          <button
            onClick={() => onDataChange('')}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors"
          >
            清空数据
          </button>
        </div>
        <textarea
          value={data}
          onChange={(e) => onDataChange(e.target.value)}
          placeholder="波形数据（逗号分隔的数值）..."
          rows={3}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
    </div>
  );
};
