import React, { useRef, useEffect, useState } from 'react';

export default function MonteCarloResults({ result, onClose }) {
  const canvasRef = useRef(null);
  const [selectedSignal, setSelectedSignal] = useState(null);

  const { stats = {}, results = [], nominal_values = {}, distribution, runs, failed_runs = 0 } = result || {};
  const signalKeys = stats ? Object.keys(stats) : [];

  useEffect(() => {
    if (signalKeys.length > 0 && !selectedSignal) {
      setSelectedSignal(signalKeys[0]);
    }
  }, [signalKeys, selectedSignal]);

  useEffect(() => {
    if (!canvasRef.current || !stats || !selectedSignal) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '200px';
    ctx.scale(dpr, dpr);

    const stat = stats[selectedSignal];
    if (!stat || !stat.values || stat.values.length === 0) return;

    const width = rect.width;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const values = stat.values;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const numBins = Math.min(20, Math.ceil(Math.sqrt(values.length)));
    const binWidth = range / numBins;

    const bins = new Array(numBins).fill(0);
    values.forEach(v => {
      let binIdx = Math.floor((v - min) / binWidth);
      if (binIdx >= numBins) binIdx = numBins - 1;
      bins[binIdx]++;
    });

    const maxBin = Math.max(...bins, 1);

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#4a90d9';
    bins.forEach((count, i) => {
      const x = padding.left + (i / numBins) * plotWidth;
      const barWidth = plotWidth / numBins - 2;
      const barHeight = (count / maxBin) * plotHeight;
      ctx.fillRect(x + 1, padding.top + plotHeight - barHeight, barWidth, barHeight);
    });

    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (i / 4) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + plotWidth, y);
      ctx.stroke();
    }

    if (stat.nominal !== null && stat.nominal !== undefined) {
      const normX = (stat.nominal - min) / range;
      const nomX = padding.left + normX * plotWidth;
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(nomX, padding.top);
      ctx.lineTo(nomX, padding.top + plotHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#e74c3c';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`标称: ${stat.nominal.toExponential(2)}`, nomX, padding.top + plotHeight + 18);
    }

    const meanX = padding.left + ((stat.mean - min) / range) * plotWidth;
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(meanX, padding.top);
    ctx.lineTo(meanX, padding.top + plotHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding.left, padding.top, plotWidth, plotHeight);

    ctx.fillStyle = '#333';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (i / 4) * plotHeight;
      const val = Math.round(maxBin * (1 - i / 4));
      ctx.fillText(val.toString(), padding.left - 5, y + 4);
    }

    ctx.textAlign = 'center';
    ctx.fillText(min.toExponential(2), padding.left, padding.top + plotHeight + 15);
    ctx.fillText(max.toExponential(2), padding.left + plotWidth, padding.top + plotHeight + 15);

    ctx.save();
    ctx.translate(15, padding.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('频次', 0, 0);
    ctx.restore();
  }, [stats, selectedSignal]);

  if (!result) return null;

  const currentStat = selectedSignal ? stats[selectedSignal] : null;

  const formatSI = (v, unit = '') => {
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'G' + unit;
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M' + unit;
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(2) + 'k' + unit;
    if (Math.abs(v) >= 1) return v.toFixed(2) + unit;
    if (Math.abs(v) >= 1e-3) return (v * 1e3).toFixed(2) + 'm' + unit;
    if (Math.abs(v) >= 1e-6) return (v * 1e6).toFixed(2) + 'u' + unit;
    if (Math.abs(v) >= 1e-9) return (v * 1e9).toFixed(2) + 'n' + unit;
    return v.toExponential(2) + unit;
  };

  return (
    <div className="montecarlo-results">
      <div className="results-header">
        <h3>蒙特卡洛分析结果</h3>
        <button className="btn-icon" onClick={onClose}>✕</button>
      </div>

      <div className="results-summary">
        <span>运行次数: {runs}</span>
        <span>失败次数: {failed_runs}</span>
        <span>分布: {distribution === 'gaussian' ? '高斯' : '均匀'}</span>
      </div>

      {nominal_values && Object.keys(nominal_values).length > 0 && (
        <div className="nominal-values">
          <div className="section-title">容差设置:</div>
          {Object.entries(nominal_values).map(([id, info]) => (
            <div key={id} className="nominal-item">
              <span>{info.type}: {formatSI(info.value)}</span>
              <span>±{(info.tolerance * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {signalKeys.length > 0 && (
        <div className="signal-selector">
          <label>选择测量信号:</label>
          <select
            value={selectedSignal || ''}
            onChange={(e) => setSelectedSignal(e.target.value)}
          >
            {signalKeys.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {currentStat && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">均值</div>
              <div className="stat-value">{formatSI(currentStat.mean)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">标准差 (σ)</div>
              <div className="stat-value">{formatSI(currentStat.std)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">最小值</div>
              <div className="stat-value">{formatSI(currentStat.min)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">最大值</div>
              <div className="stat-value">{formatSI(currentStat.max)}</div>
            </div>
          </div>

          {currentStat.nominal !== null && currentStat.nominal !== undefined && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">标称值</div>
                <div className="stat-value">{formatSI(currentStat.nominal)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">均值偏差</div>
                <div className="stat-value">
                  {(((currentStat.mean - currentStat.nominal) / currentStat.nominal) * 100).toFixed(2)}%
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">3σ 范围</div>
                <div className="stat-value">
                  {formatSI(currentStat.mean - 3 * currentStat.std)} ~ {formatSI(currentStat.mean + 3 * currentStat.std)}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">变异系数</div>
                <div className="stat-value">
                  {currentStat.mean !== 0 ? ((currentStat.std / Math.abs(currentStat.mean)) * 100).toFixed(2) : 'N/A'}%
                </div>
              </div>
            </div>
          )}

          <div className="section-title">直方图:</div>
          <div className="histogram-container">
            <canvas ref={canvasRef} />
          </div>
          <div className="histogram-legend">
            <span className="legend-line" style={{ borderColor: '#2ecc71' }} />
            <span>均值</span>
            <span className="legend-line" style={{ borderColor: '#e74c3c' }} />
            <span>标称值</span>
          </div>
        </>
      )}

      {failed_runs > 0 && result.errors && result.errors.length > 0 && (
        <div className="errors-section">
          <div className="section-title">失败仿真:</div>
          <div className="errors-list">
            {result.errors.slice(0, 5).map((e, i) => (
              <div key={i} className="error-item">
                运行 #{e.run}: {e.error}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
