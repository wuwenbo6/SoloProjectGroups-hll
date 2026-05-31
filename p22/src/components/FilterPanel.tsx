import React from 'react';
import { Sliders, Maximize2, Crop, Check, ToggleLeft, ToggleRight } from 'lucide-react';
import { FilterConfig } from '@/types';

interface FilterPanelProps {
  config: FilterConfig;
  onChange: (config: FilterConfig) => void;
  disabled?: boolean;
  inputWidth?: number;
  inputHeight?: number;
}

export function FilterPanel({ config, onChange, disabled, inputWidth, inputHeight }: FilterPanelProps) {
  const updateScale = (key: keyof FilterConfig['scale'], value: any) => {
    onChange({
      ...config,
      scale: { ...config.scale, [key]: value },
    });
  };

  const updateCrop = (key: keyof FilterConfig['crop'], value: any) => {
    onChange({
      ...config,
      crop: { ...config.crop, [key]: value },
    });
  };

  const presetSizes = [
    { name: '4K', width: 3840, height: 2160 },
    { name: '1080p', width: 1920, height: 1080 },
    { name: '720p', width: 1280, height: 720 },
    { name: '480p', width: 854, height: 480 },
    { name: '360p', width: 640, height: 360 },
  ];

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Sliders className="w-4 h-4 text-primary-400" />
        <span className="font-medium">滤镜配置</span>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-primary-400" />
              <span className="text-sm font-medium">缩放 (Scale)</span>
            </div>
            <button
              type="button"
              onClick={() => updateScale('enabled', !config.scale.enabled)}
              disabled={disabled}
              className="text-primary-400 hover:text-primary-300 transition-colors"
            >
              {config.scale.enabled ? (
                <ToggleRight className="w-8 h-8" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-dark-300" />
              )}
            </button>
          </div>

          {config.scale.enabled && (
            <div className="pl-6 space-y-3 animate-fade-in">
              <div className="flex flex-wrap gap-2">
                {presetSizes.map((size) => (
                  <button
                    key={size.name}
                    type="button"
                    onClick={() => {
                      updateScale('width', size.width);
                      updateScale('height', size.height);
                    }}
                    disabled={disabled}
                    className={`px-2 py-1 text-xs rounded-md transition-colors ${
                      config.scale.width === size.width && config.scale.height === size.height
                        ? 'bg-primary-500 text-white'
                        : 'bg-dark-700 hover:bg-dark-600'
                    }`}
                  >
                    {size.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-dark-200 mb-1 block">宽度</label>
                  <input
                    type="number"
                    value={config.scale.width}
                    onChange={(e) => updateScale('width', parseInt(e.target.value) || 0)}
                    disabled={disabled}
                    className="w-full px-3 py-2 bg-dark-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-dark-200 mb-1 block">高度</label>
                  <input
                    type="number"
                    value={config.scale.height}
                    onChange={(e) => updateScale('height', parseInt(e.target.value) || 0)}
                    disabled={disabled}
                    className="w-full px-3 py-2 bg-dark-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.scale.keepAspect}
                  onChange={(e) => updateScale('keepAspect', e.target.checked)}
                  disabled={disabled}
                  className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm">保持宽高比</span>
              </label>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crop className="w-4 h-4 text-primary-400" />
              <span className="text-sm font-medium">裁剪 (Crop)</span>
            </div>
            <button
              type="button"
              onClick={() => updateCrop('enabled', !config.crop.enabled)}
              disabled={disabled}
              className="text-primary-400 hover:text-primary-300 transition-colors"
            >
              {config.crop.enabled ? (
                <ToggleRight className="w-8 h-8" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-dark-300" />
              )}
            </button>
          </div>

          {config.crop.enabled && (
            <div className="pl-6 space-y-3 animate-fade-in">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-dark-200 mb-1 block">宽度</label>
                  <input
                    type="number"
                    value={config.crop.width}
                    onChange={(e) => updateCrop('width', parseInt(e.target.value) || 0)}
                    disabled={disabled}
                    max={inputWidth}
                    className="w-full px-3 py-2 bg-dark-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-dark-200 mb-1 block">高度</label>
                  <input
                    type="number"
                    value={config.crop.height}
                    onChange={(e) => updateCrop('height', parseInt(e.target.value) || 0)}
                    disabled={disabled}
                    max={inputHeight}
                    className="w-full px-3 py-2 bg-dark-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-dark-200 mb-1 block">X 偏移</label>
                  <input
                    type="number"
                    value={config.crop.x}
                    onChange={(e) => updateCrop('x', parseInt(e.target.value) || 0)}
                    disabled={disabled}
                    className="w-full px-3 py-2 bg-dark-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-dark-200 mb-1 block">Y 偏移</label>
                  <input
                    type="number"
                    value={config.crop.y}
                    onChange={(e) => updateCrop('y', parseInt(e.target.value) || 0)}
                    disabled={disabled}
                    className="w-full px-3 py-2 bg-dark-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {inputWidth && inputHeight && (
                <p className="text-xs text-dark-300">
                  原始尺寸: {inputWidth} × {inputHeight}
                </p>
              )}
            </div>
          )}
        </div>

        {(config.scale.enabled || config.crop.enabled) && (
          <div className="p-3 bg-dark-700/50 rounded-lg">
            <p className="text-xs text-dark-200 mb-1">生成的滤镜参数:</p>
            <code className="text-xs text-primary-400 font-mono break-all">
              -vf "{config.scale.enabled ? `scale=${config.scale.width}:${config.scale.keepAspect ? '-2' : config.scale.height}` : ''}
              {config.scale.enabled && config.crop.enabled ? ',' : ''}
              {config.crop.enabled ? `crop=${config.crop.width}:${config.crop.height}:${config.crop.x}:${config.crop.y}` : ''}"
            </code>
          </div>
        )}
      </div>
    </div>
  );
}
