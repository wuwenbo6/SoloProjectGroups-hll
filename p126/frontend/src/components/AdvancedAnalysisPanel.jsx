import React, { useState } from 'react';
import { monteCarlo, temperatureSweep } from '../utils/api.js';

export default function AdvancedAnalysisPanel({
  circuitData,
  simulationConfig,
  onMonteCarloResult,
  onTemperatureResult,
  isRunning,
  setIsRunning,
  setError
}) {
  const [activeTab, setActiveTab] = useState('montecarlo');
  const [tolerances, setTolerances] = useState([]);
  const [selectedComponent, setSelectedComponent] = useState('');
  const [tolerance, setTolerance] = useState(0.05);
  const [distribution, setDistribution] = useState('gaussian');
  const [runs, setRuns] = useState(50);
  const [measurePoint, setMeasurePoint] = useState('');
  const [temperatures, setTemperatures] = useState('-40, 0, 27, 85, 125');
  const [progress, setProgress] = useState(0);

  const { components = [] } = circuitData || { components: [] };
  const variableComponents = components.filter(c =>
    ['resistor', 'capacitor', 'inductor', 'voltage_source', 'current_source'].includes(c.type)
  );

  const addTolerance = () => {
    if (!selectedComponent || tolerance <= 0) return;
    if (tolerances.find(t => t.component_id === selectedComponent)) return;
    setTolerances([...tolerances, { component_id: selectedComponent, tolerance: parseFloat(tolerance) }]);
    setSelectedComponent('');
  };

  const removeTolerance = (compId) => {
    setTolerances(tolerances.filter(t => t.component_id !== compId));
  };

  const runMonteCarlo = async () => {
    if (tolerances.length === 0) {
      setError('请至少添加一个元件容差');
      return;
    }
    setIsRunning(true);
    setProgress(0);
    setError(null);

    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + 2, 95));
    }, 500);

    try {
      const measurePoints = measurePoint ? [measurePoint] : null;
      const result = await monteCarlo(circuitData, simulationConfig, {
        tolerances,
        runs: parseInt(runs),
        distribution,
        measure_points: measurePoints
      });
      setProgress(100);
      onMonteCarloResult(result);
    } catch (e) {
      setError(e.message);
    } finally {
      clearInterval(progressInterval);
      setIsRunning(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const runTemperatureSweep = async () => {
    const temps = temperatures.split(',').map(t => parseFloat(t.trim())).filter(t => !isNaN(t));
    if (temps.length === 0) {
      setError('请输入有效的温度列表（逗号分隔）');
      return;
    }
    setIsRunning(true);
    setProgress(0);
    setError(null);

    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + 10, 95));
    }, 500);

    try {
      const result = await temperatureSweep(circuitData, simulationConfig, temps);
      setProgress(100);
      onTemperatureResult(result);
    } catch (e) {
      setError(e.message);
    } finally {
      clearInterval(progressInterval);
      setIsRunning(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const getCompName = (id) => {
    const comp = components.find(c => c.id === id);
    if (!comp) return id;
    const icons = { resistor: 'R', capacitor: 'C', inductor: 'L', voltage_source: 'V', current_source: 'I' };
    return `${icons[comp.type] || comp.type.slice(0, 1)}: ${comp.value.toExponential(2)}`;
  };

  const availableSignals = [];
  if (simulationConfig?.type === 'tran') {
    components.forEach(c => {
      if (c.type === 'voltage_source' || c.type === 'ground') return;
      availableSignals.push(`V(${c.id}_node0)`);
    });
  }

  return (
    <div className="advanced-panel">
      <h3>高级分析</h3>
      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'montecarlo' ? 'active' : ''}`}
          onClick={() => setActiveTab('montecarlo')}
        >
          蒙特卡洛
        </button>
        <button
          className={`tab-btn ${activeTab === 'temperature' ? 'active' : ''}`}
          onClick={() => setActiveTab('temperature')}
        >
          温度扫描
        </button>
      </div>

      {isRunning && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {activeTab === 'montecarlo' && (
        <div className="tab-content">
          <div className="prop-group">
            <label>采样分布</label>
            <select
              value={distribution}
              onChange={(e) => setDistribution(e.target.value)}
            >
              <option value="gaussian">高斯分布</option>
              <option value="uniform">均匀分布</option>
            </select>
          </div>

          <div className="prop-group">
            <label>运行次数</label>
            <input
              type="number"
              min="10"
              max="500"
              value={runs}
              onChange={(e) => setRuns(e.target.value)}
            />
          </div>

          <div className="prop-group">
            <label>添加元件容差</label>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <select
                value={selectedComponent}
                onChange={(e) => setSelectedComponent(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">选择元件...</option>
                {variableComponents.map(c => (
                  <option key={c.id} value={c.id}>{getCompName(c.id)}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0.001"
                max="0.99"
                value={tolerance}
                onChange={(e) => setTolerance(e.target.value)}
                style={{ width: '70px' }}
                placeholder="±"
              />
              <button className="btn btn-primary" onClick={addTolerance} style={{ padding: '6px 12px' }}>
                +
              </button>
            </div>

            {tolerances.length > 0 && (
              <div className="tolerance-list">
                {tolerances.map(t => (
                  <div key={t.component_id} className="tolerance-item">
                    <span>{getCompName(t.component_id)} ±{(t.tolerance * 100).toFixed(1)}%</span>
                    <button className="btn-icon" onClick={() => removeTolerance(t.component_id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="prop-group">
            <label>测量节点（可选）</label>
            <select
              value={measurePoint}
              onChange={(e) => setMeasurePoint(e.target.value)}
            >
              <option value="">（自动：最后节点电压）</option>
              {availableSignals.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '12px' }}
            onClick={runMonteCarlo}
            disabled={isRunning || tolerances.length === 0}
          >
            {isRunning ? '运行中...' : '运行蒙特卡洛分析'}
          </button>
        </div>
      )}

      {activeTab === 'temperature' && (
        <div className="tab-content">
          <div className="prop-group">
            <label>温度列表 (°C)</label>
            <input
              type="text"
              value={temperatures}
              onChange={(e) => setTemperatures(e.target.value)}
              placeholder="-40, 0, 27, 85, 125"
            />
            <div className="prop-hint">逗号分隔多个温度值</div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '12px' }}
            onClick={runTemperatureSweep}
            disabled={isRunning}
          >
            {isRunning ? '运行中...' : '运行温度扫描'}
          </button>
        </div>
      )}
    </div>
  );
}
