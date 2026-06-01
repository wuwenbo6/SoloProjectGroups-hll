import React from 'react';
import { FilterType, CustomKernel, PRESET_KERNELS } from '../types';
import { KernelEditor } from './KernelEditor';

interface FilterPanelProps {
  currentFilter: FilterType;
  currentIntensity: number;
  customKernel: CustomKernel | undefined;
  onFilterChange: (filter: FilterType, intensity: number, kernel?: CustomKernel) => void;
  onKernelChange: (kernel: CustomKernel) => void;
  disabled: boolean;
}

const filters: { type: FilterType; name: string; icon: string; description: string }[] = [
  { type: null, name: '原图', icon: '🖼️', description: '不应用滤镜' },
  { type: 'blur', name: '模糊', icon: '🌫️', description: '高斯模糊效果' },
  { type: 'sharpen', name: '锐化', icon: '⚡', description: '增强边缘细节' },
  { type: 'edgeDetect', name: '边缘检测', icon: '📐', description: 'Sobel算子边缘提取' },
  { type: 'oilPaint', name: '油画', icon: '🎨', description: '油画艺术效果' },
  { type: 'custom', name: '自定义', icon: '🔧', description: '自定义卷积核' },
];

export const FilterPanel: React.FC<FilterPanelProps> = ({
  currentFilter,
  currentIntensity,
  customKernel,
  onFilterChange,
  onKernelChange,
  disabled,
}) => {
  const defaultKernel: CustomKernel = PRESET_KERNELS[0];

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700">
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
        滤镜效果
      </h2>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {filters.map((filter) => (
          <button
            key={filter.name}
            onClick={() => onFilterChange(
              filter.type, 
              currentIntensity,
              filter.type === 'custom' ? (customKernel || defaultKernel) : undefined
            )}
            disabled={disabled}
            className={`p-2 rounded-lg text-center transition-all duration-200 ${
              currentFilter === filter.type
                ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-400 text-white'
                : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-700'
            } border ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="text-xl mb-1">{filter.icon}</div>
            <div className="text-xs font-medium">{filter.name}</div>
          </button>
        ))}
      </div>

      {currentFilter && (
        <div className="mt-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="flex justify-between items-center mb-3">
            <label className="text-sm text-gray-300">强度调节</label>
            <span className="text-cyan-400 font-mono text-sm">
              {Math.round(currentIntensity * 100)}%
            </span>
          </div>
          <div className="relative">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={currentIntensity}
              onChange={(e) => onFilterChange(currentFilter, parseFloat(e.target.value), customKernel)}
              disabled={disabled}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, #00d4ff 0%, #00d4ff ${currentIntensity * 100}%, #374151 ${currentIntensity * 100}%, #374151 100%)`
              }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {filters.find(f => f.type === currentFilter)?.description}
          </p>
        </div>
      )}

      {currentFilter === 'custom' && customKernel && (
        <KernelEditor
          kernel={customKernel}
          onChange={onKernelChange}
          disabled={disabled}
        />
      )}
    </div>
  );
};
