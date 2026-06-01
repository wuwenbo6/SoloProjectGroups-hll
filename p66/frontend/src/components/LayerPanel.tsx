import React from 'react';
import { Layer, BlendMode } from '../types';

interface LayerPanelProps {
  layers: Layer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onAddLayer: () => void;
  onDeleteLayer: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  onBlendModeChange: (id: string, mode: BlendMode) => void;
  onMoveLayer: (id: string, direction: 'up' | 'down') => void;
  disabled: boolean;
}

const blendModes: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: '正常' },
  { value: 'multiply', label: '正片叠底' },
  { value: 'screen', label: '滤色' },
  { value: 'overlay', label: '叠加' },
];

export const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onAddLayer,
  onDeleteLayer,
  onToggleVisibility,
  onOpacityChange,
  onBlendModeChange,
  onMoveLayer,
  disabled,
}) => {
  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></span>
          图层
        </h2>
        <button
          onClick={onAddLayer}
          disabled={disabled}
          className="p-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="添加图层"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {[...layers].reverse().map((layer, index) => (
          <div
            key={layer.id}
            className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
              selectedLayerId === layer.id
                ? 'bg-purple-500/20 border-purple-400'
                : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700'
            }`}
            onClick={() => onSelectLayer(layer.id)}
          >
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(layer.id);
                }}
                className={`p-1 rounded transition-colors ${
                  layer.visible
                    ? 'text-white hover:bg-gray-600'
                    : 'text-gray-500 hover:bg-gray-600 hover:text-gray-400'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {layer.visible ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  )}
                </svg>
              </button>
              <span className={`flex-1 text-sm font-medium truncate ${
                layer.visible ? 'text-white' : 'text-gray-500'
              }`}>
                {layer.name}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveLayer(layer.id, 'up');
                  }}
                  disabled={index === 0}
                  className="p-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveLayer(layer.id, 'down');
                  }}
                  disabled={index === layers.length - 1}
                  className="p-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {layers.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLayer(layer.id);
                    }}
                    className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {selectedLayerId === layer.id && (
              <div className="space-y-2 pt-2 border-t border-gray-600">
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>不透明度</span>
                    <span>{Math.round(layer.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={layer.opacity}
                    onChange={(e) => onOpacityChange(layer.id, parseFloat(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${layer.opacity * 100}%, #4b5563 ${layer.opacity * 100}%, #4b5563 100%)`
                    }}
                  />
                </div>
                <select
                  value={layer.blendMode}
                  onChange={(e) => onBlendModeChange(layer.id, e.target.value as BlendMode)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:border-purple-400 focus:outline-none"
                >
                  {blendModes.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>

      {layers.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          上传图片以创建图层
        </div>
      )}
    </div>
  );
};
