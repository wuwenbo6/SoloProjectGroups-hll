import React from 'react';
import type { InterpolationParams } from '../../shared/types';

interface ParamsConfigProps {
  params: InterpolationParams;
  onChange: (params: InterpolationParams) => void;
}

const paramConfig = [
  {
    key: 'power' as const,
    label: 'IDW 幂指数 (Power)',
    min: 1,
    max: 5,
    step: 0.5,
    description: '控制插值的平滑程度，值越大越平滑',
  },
  {
    key: 'searchRadius' as const,
    label: '搜索半径 (Search Radius)',
    min: 100,
    max: 2000,
    step: 100,
    description: '参与插值的最大距离范围 (米)',
  },
  {
    key: 'gridSize' as const,
    label: '网格大小 (Grid Size)',
    min: 10,
    max: 100,
    step: 5,
    description: '输出栅格的分辨率 (米)',
  },
];

export const ParamsConfig: React.FC<ParamsConfigProps> = ({ params, onChange }) => {
  const handleChange = (key: keyof InterpolationParams, value: number) => {
    onChange({ ...params, [key]: value });
  };

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-6">IDW 参数配置</h3>
      <div className="space-y-6">
        {paramConfig.map((config) => (
          <div key={config.key} className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-300">
                {config.label}
              </label>
              <span className="text-sm font-mono text-accent bg-accent/10 px-3 py-1 rounded">
                {params[config.key]}
              </span>
            </div>
            <input
              type="range"
              min={config.min}
              max={config.max}
              step={config.step}
              value={params[config.key]}
              onChange={(e) => handleChange(config.key, Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{config.min}</span>
              <span className="text-gray-400">{config.description}</span>
              <span>{config.max}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
