import React, { useState } from 'react';
import { CustomKernel, PRESET_KERNELS } from '../types';

interface KernelEditorProps {
  kernel: CustomKernel;
  onChange: (kernel: CustomKernel) => void;
  disabled?: boolean;
}

export const KernelEditor: React.FC<KernelEditorProps> = ({
  kernel,
  onChange,
  disabled = false,
}) => {
  const [showPresets, setShowPresets] = useState(false);

  const handleValueChange = (index: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    const newValues = [...kernel.values];
    newValues[index] = numValue;
    onChange({ ...kernel, values: newValues });
  };

  const handleSizeChange = (size: 3 | 5) => {
    const newValues = size === 3 
      ? kernel.values.slice(0, 9)
      : [...kernel.values, ...Array(25 - kernel.values.length).fill(0)];
    onChange({ ...kernel, size, values: newValues.slice(0, size * size) });
  };

  const handlePresetSelect = (preset: CustomKernel) => {
    onChange(preset);
    setShowPresets(false);
  };

  const calculateDivisor = () => {
    const sum = kernel.values.reduce((a, b) => a + b, 0);
    return sum !== 0 ? sum : 1;
  };

  return (
    <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-white">卷积核</label>
        <button
          onClick={() => setShowPresets(!showPresets)}
          disabled={disabled}
          className="text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
        >
          预设 ▼
        </button>
      </div>

      {showPresets && (
        <div className="mb-3 p-2 bg-gray-800 rounded-lg grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
          {PRESET_KERNELS.map((preset, i) => (
            <button
              key={i}
              onClick={() => handlePresetSelect(preset)}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded"
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-3">
        {([3, 5] as const).map((size) => (
          <button
            key={size}
            onClick={() => handleSizeChange(size)}
            disabled={disabled}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              kernel.size === size
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/50'
                : 'bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {size}×{size}
          </button>
        ))}
      </div>

      <div 
        className="grid gap-1 mb-3 mx-auto"
        style={{ 
          gridTemplateColumns: `repeat(${kernel.size}, 1fr)`,
          maxWidth: kernel.size * 56,
        }}
      >
        {kernel.values.map((value, i) => (
          <input
            key={i}
            type="number"
            step="1"
            value={value}
            onChange={(e) => handleValueChange(i, e.target.value)}
            disabled={disabled}
            className="w-12 h-12 text-center bg-gray-800 border border-gray-600 rounded text-white text-sm font-mono focus:border-cyan-400 focus:outline-none disabled:opacity-50"
          />
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-400 block mb-1">除数</label>
          <input
            type="number"
            step="1"
            value={kernel.divisor}
            onChange={(e) => onChange({ ...kernel, divisor: parseFloat(e.target.value) || 1 })}
            disabled={disabled}
            className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm font-mono focus:border-cyan-400 focus:outline-none disabled:opacity-50"
          />
        </div>
        <button
          onClick={() => onChange({ ...kernel, divisor: calculateDivisor() })}
          disabled={disabled}
          className="mt-5 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded disabled:opacity-50"
        >
          自动
        </button>
      </div>

      <div className="mt-2">
        <label className="text-xs text-gray-400 block mb-1">偏移</label>
        <input
          type="number"
          step="1"
          value={kernel.offset}
          onChange={(e) => onChange({ ...kernel, offset: parseFloat(e.target.value) || 0 })}
          disabled={disabled}
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm font-mono focus:border-cyan-400 focus:outline-none disabled:opacity-50"
        />
      </div>
    </div>
  );
};
