import React from 'react';
import { COMPONENT_TYPES } from '../types/circuit.js';
import { formatValue, getUnitForType } from '../utils/circuitUtils.js';

export default function PropertyPanel({ circuitData, selectedComponent, onChange }) {
  const { components = [] } = circuitData;
  const comp = components.find(c => c.id === selectedComponent);

  if (!comp) {
    return (
      <div className="property-panel">
        <h3>属性</h3>
        <p className="hint">选择元件以编辑属性</p>
      </div>
    );
  }

  const config = COMPONENT_TYPES[comp.type];
  const unit = getUnitForType(comp.type);

  const handleValueChange = (e) => {
    const val = parseFloat(e.target.value);
    if (isNaN(val)) return;
    const newComponents = components.map(c => {
      if (c.id === comp.id) return { ...c, value: val };
      return c;
    });
    onChange({ ...circuitData, components: newComponents });
  };

  const handleParamChange = (key, val) => {
    const newComponents = components.map(c => {
      if (c.id === comp.id) {
        return { ...c, parameters: { ...c.parameters, [key]: val } };
      }
      return c;
    });
    onChange({ ...circuitData, components: newComponents });
  };

  const handleRotationChange = (rotation) => {
    const newComponents = components.map(c => {
      if (c.id === comp.id) return { ...c, rotation };
      return c;
    });
    onChange({ ...circuitData, components: newComponents });
  };

  return (
    <div className="property-panel">
      <h3>属性</h3>
      <div className="prop-group">
        <label>类型</label>
        <div className="prop-value">{config.label}</div>
      </div>
      <div className="prop-group">
        <label>ID</label>
        <div className="prop-value mono">{comp.id}</div>
      </div>
      {comp.type !== 'ground' && (
        <>
          <div className="prop-group">
            <label>值 ({unit})</label>
            <input
              type="number"
              step="any"
              value={comp.value}
              onChange={handleValueChange}
            />
            <div className="prop-hint">当前: {formatValue(comp.value, unit)}</div>
          </div>
          <div className="prop-group">
            <label>旋转</label>
            <div className="rotation-buttons">
              {[0, 90, 180, 270].map(r => (
                <button
                  key={r}
                  className={`btn ${(comp.rotation || 0) === r ? 'active' : ''}`}
                  onClick={() => handleRotationChange(r)}
                >
                  {r}°
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {comp.type === 'voltage_source' && (
        <div className="prop-group">
          <label>波形</label>
          <select
            value={comp.parameters?.waveform || 'dc'}
            onChange={(e) => handleParamChange('waveform', e.target.value)}
          >
            <option value="dc">直流</option>
            <option value="sine">正弦</option>
            <option value="pulse">脉冲</option>
          </select>
          {comp.parameters?.waveform === 'dc' && (
            <div className="prop-group nested">
              <label>直流电压 (V)</label>
              <input
                type="number"
                step="any"
                value={comp.parameters?.dc || 0}
                onChange={(e) => handleParamChange('dc', parseFloat(e.target.value))}
              />
            </div>
          )}
          {comp.parameters?.waveform === 'sine' && (
            <>
              <div className="prop-group nested">
                <label>振幅 (V)</label>
                <input
                  type="number"
                  step="any"
                  value={comp.parameters?.amplitude || 1}
                  onChange={(e) => handleParamChange('amplitude', parseFloat(e.target.value))}
                />
              </div>
              <div className="prop-group nested">
                <label>频率 (Hz)</label>
                <input
                  type="number"
                  step="any"
                  value={comp.parameters?.frequency || 1000}
                  onChange={(e) => handleParamChange('frequency', parseFloat(e.target.value))}
                />
              </div>
              <div className="prop-group nested">
                <label>相位 (°)</label>
                <input
                  type="number"
                  step="any"
                  value={comp.parameters?.phase || 0}
                  onChange={(e) => handleParamChange('phase', parseFloat(e.target.value))}
                />
              </div>
            </>
          )}
          {comp.parameters?.waveform === 'pulse' && (
            <>
              <div className="prop-group nested">
                <label>低电平 (V)</label>
                <input
                  type="number"
                  step="any"
                  value={comp.parameters?.vlow || 0}
                  onChange={(e) => handleParamChange('vlow', parseFloat(e.target.value))}
                />
              </div>
              <div className="prop-group nested">
                <label>高电平 (V)</label>
                <input
                  type="number"
                  step="any"
                  value={comp.parameters?.vhigh || 5}
                  onChange={(e) => handleParamChange('vhigh', parseFloat(e.target.value))}
                />
              </div>
              <div className="prop-group nested">
                <label>周期 (s)</label>
                <input
                  type="number"
                  step="any"
                  value={comp.parameters?.period || 0.001}
                  onChange={(e) => handleParamChange('period', parseFloat(e.target.value))}
                />
              </div>
              <div className="prop-group nested">
                <label>脉宽 (s)</label>
                <input
                  type="number"
                  step="any"
                  value={comp.parameters?.width || 0.0005}
                  onChange={(e) => handleParamChange('width', parseFloat(e.target.value))}
                />
              </div>
            </>
          )}
        </div>
      )}
      {comp.type === 'current_source' && (
        <div className="prop-group">
          <label>波形</label>
          <select
            value={comp.parameters?.waveform || 'dc'}
            onChange={(e) => handleParamChange('waveform', e.target.value)}
          >
            <option value="dc">直流</option>
            <option value="sine">正弦</option>
          </select>
          {comp.parameters?.waveform === 'dc' && (
            <div className="prop-group nested">
              <label>直流电流 (A)</label>
              <input
                type="number"
                step="any"
                value={comp.parameters?.dc || 0.001}
                onChange={(e) => handleParamChange('dc', parseFloat(e.target.value))}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
