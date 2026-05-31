import React, { useState } from 'react';

function SliderParameter({ param, value, onChange }) {
  const [isDragging, setIsDragging] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  const handleChange = (e) => {
    const newValue = parseFloat(e.target.value);
    setTempValue(newValue);
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      onChange(param.name, tempValue);
    }
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleTouchEnd = () => {
    if (isDragging) {
      setIsDragging(false);
      onChange(param.name, tempValue);
    }
  };

  const displayValue = isDragging ? tempValue : value;

  return (
    <div className="param-group">
      <div className="param-label">
        <span>{param.label}</span>
        <span className="param-value" style={{ opacity: isDragging ? 0.7 : 1 }}>
          {displayValue}
          {isDragging && <span style={{ fontSize: '10px', marginLeft: '4px' }}>(释放更新)</span>}
        </span>
      </div>
      <input
        type="range"
        className="slider"
        min={param.min}
        max={param.max}
        step={param.step}
        value={displayValue}
        onChange={handleChange}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  );
}

function NumberParameter({ param, value, onChange }) {
  const [localValue, setLocalValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);

  const handleBlur = () => {
    setIsEditing(false);
    onChange(param.name, parseFloat(localValue));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  if (!isEditing) {
    return (
      <div className="param-group">
        <div className="param-label">
          <span>{param.label}</span>
        </div>
        <input
          type="number"
          className="number-input"
          min={param.min}
          max={param.max}
          step={param.step || 1}
          value={value}
          onChange={(e) => setLocalValue(e.target.value)}
          onFocus={() => {
            setIsEditing(true);
            setLocalValue(value);
          }}
        />
      </div>
    );
  }

  return (
    <div className="param-group">
      <div className="param-label">
        <span>{param.label}</span>
      </div>
      <input
        type="number"
        className="number-input"
        min={param.min}
        max={param.max}
        step={param.step || 1}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyPress={handleKeyPress}
        autoFocus
      />
    </div>
  );
}

function TextParameter({ param, value, onChange }) {
  const [localValue, setLocalValue] = useState(value);

  const handleBlur = () => {
    onChange(param.name, localValue);
  };

  return (
    <div className="param-group">
      <div className="param-label">
        <span>{param.label}</span>
      </div>
      <input
        type="text"
        className="text-input"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
      />
    </div>
  );
}

function ParameterEditor({ parameters, values, onChange }) {
  const renderParameter = (param) => {
    const value = values[param.name] ?? param.default;
    
    switch (param.type) {
      case 'slider':
        return <SliderParameter key={param.name} param={param} value={value} onChange={onChange} />;
      case 'number':
        return <NumberParameter key={param.name} param={param} value={value} onChange={onChange} />;
      case 'text':
        return <TextParameter key={param.name} param={param} value={value} onChange={onChange} />;
      default:
        return <SliderParameter key={param.name} param={param} value={value} onChange={onChange} />;
    }
  };

  return (
    <div>
      {parameters.map(renderParameter)}
      <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', textAlign: 'center' }}>
        💡 拖动滑块后释放鼠标更新模型
      </div>
    </div>
  );
}

export default ParameterEditor;