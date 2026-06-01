import React, { useState } from 'react';
import { SIMULATION_TYPES } from '../types/circuit.js';

export default function SimulationPanel({ onSimulate, onExportNetlist, circuitData, isSimulating }) {
  const [simType, setSimType] = useState('tran');
  const [config, setConfig] = useState({
    type: 'tran',
    start: 0,
    stop: 0.01,
    step: 1e-5,
    fstart: 1,
    fstop: 1e6,
    points: 100
  });
  const [temperature, setTemperature] = useState('');
  const [useTemperature, setUseTemperature] = useState(false);

  const handleTypeChange = (type) => {
    setSimType(type);
    setConfig(c => ({ ...c, type }));
  };

  const handleConfigChange = (key, val) => {
    setConfig(c => ({ ...c, [key]: parseFloat(val) || val }));
  };

  const handleSimulate = () => {
    const temp = useTemperature ? (parseFloat(temperature) || 27) : null;
    onSimulate(circuitData, config, temp);
  };

  return (
    <div className="simulation-panel">
      <h3>仿真控制</h3>

      <div className="sim-type-selector">
        {Object.entries(SIMULATION_TYPES).map(([key, val]) => (
          <button
            key={key}
            className={`btn ${simType === key ? 'active' : ''}`}
            onClick={() => handleTypeChange(key)}
          >
            {val.label}
          </button>
        ))}
      </div>

      {simType === 'tran' && (
        <>
          <div className="prop-group">
            <label>起始时间 (s)</label>
            <input
              type="number"
              step="any"
              value={config.start}
              onChange={(e) => handleConfigChange('start', e.target.value)}
            />
          </div>
          <div className="prop-group">
            <label>终止时间 (s)</label>
            <input
              type="number"
              step="any"
              value={config.stop}
              onChange={(e) => handleConfigChange('stop', e.target.value)}
            />
          </div>
          <div className="prop-group">
            <label>时间步长 (s)</label>
            <input
              type="number"
              step="any"
              value={config.step}
              onChange={(e) => handleConfigChange('step', e.target.value)}
            />
          </div>
        </>
      )}

      {simType === 'ac' && (
        <>
          <div className="prop-group">
            <label>起始频率 (Hz)</label>
            <input
              type="number"
              step="any"
              value={config.fstart}
              onChange={(e) => handleConfigChange('fstart', e.target.value)}
            />
          </div>
          <div className="prop-group">
            <label>终止频率 (Hz)</label>
            <input
              type="number"
              step="any"
              value={config.fstop}
              onChange={(e) => handleConfigChange('fstop', e.target.value)}
            />
          </div>
          <div className="prop-group">
            <label>点数/十倍频</label>
            <input
              type="number"
              step="any"
              value={config.points}
              onChange={(e) => handleConfigChange('points', e.target.value)}
            />
          </div>
        </>
      )}

      {simType === 'dc' && (
        <>
          <div className="prop-group">
            <label>扫描源</label>
            <input
              type="text"
              value={config.source || 'V1'}
              onChange={(e) => handleConfigChange('source', e.target.value)}
            />
          </div>
          <div className="prop-group">
            <label>起始值</label>
            <input
              type="number"
              step="any"
              value={config.start}
              onChange={(e) => handleConfigChange('start', e.target.value)}
            />
          </div>
          <div className="prop-group">
            <label>终止值</label>
            <input
              type="number"
              step="any"
              value={config.stop}
              onChange={(e) => handleConfigChange('stop', e.target.value)}
            />
          </div>
          <div className="prop-group">
            <label>步长</label>
            <input
              type="number"
              step="any"
              value={config.step || 0.1}
              onChange={(e) => handleConfigChange('step', e.target.value)}
            />
          </div>
        </>
      )}

      <div className="prop-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={useTemperature}
            onChange={(e) => setUseTemperature(e.target.checked)}
          />
          设置仿真温度
        </label>
        {useTemperature && (
          <input
            type="number"
            step="1"
            value={temperature === '' ? 27 : temperature}
            onChange={(e) => setTemperature(e.target.value)}
            placeholder="27"
            style={{ marginTop: '4px' }}
          />
        )}
        <div className="prop-hint">默认: 27°C (室温)</div>
      </div>

      <div className="sim-actions">
        <button
          className="btn btn-primary"
          onClick={handleSimulate}
          disabled={isSimulating || !circuitData?.components?.length}
        >
          {isSimulating ? '仿真中...' : '运行仿真'}
        </button>
        <button
          className="btn"
          onClick={() => onExportNetlist(circuitData, config)}
          disabled={!circuitData?.components?.length}
        >
          导出网表
        </button>
      </div>
    </div>
  );
}
