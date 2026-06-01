import React from 'react';
import { SonarParams } from '../types/sonar';

interface ControlPanelProps {
  params: SonarParams;
  onParamsChange: (params: Partial<SonarParams>) => void;
  onReset: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  params,
  onParamsChange,
  onReset,
}) => {
  return (
    <div className="bg-sonar-dark/90 backdrop-blur-sm rounded-xl p-6 border border-sonar-scan/30 shadow-xl">
      <h2 className="text-xl font-bold text-sonar-scan mb-6 font-mono border-b border-sonar-scan/30 pb-3">
        ⚙ 声呐参数控制
      </h2>

      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-white/80 font-mono text-sm">
              📡 波束角
            </label>
            <span className="text-sonar-scan font-mono text-sm bg-sonar-scan/10 px-2 py-1 rounded">
              {params.beamAngle}°
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="60"
            value={params.beamAngle}
            onChange={(e) => onParamsChange({ beamAngle: Number(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          />
          <div className="flex justify-between text-xs text-gray-500 font-mono">
            <span>1°</span>
            <span>60°</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-white/80 font-mono text-sm">
              📶 增益
            </label>
            <span className="text-sonar-scan font-mono text-sm bg-sonar-scan/10 px-2 py-1 rounded">
              {params.gain}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={params.gain}
            onChange={(e) => onParamsChange({ gain: Number(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          />
          <div className="flex justify-between text-xs text-gray-500 font-mono">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-white/80 font-mono text-sm">
              ⚡ 扫描速度
            </label>
            <span className="text-sonar-scan font-mono text-sm bg-sonar-scan/10 px-2 py-1 rounded">
              {params.scanSpeed}°/s
            </span>
          </div>
          <input
            type="range"
            min="10"
            max="180"
            value={params.scanSpeed}
            onChange={(e) => onParamsChange({ scanSpeed: Number(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          />
          <div className="flex justify-between text-xs text-gray-500 font-mono">
            <span>10°/s</span>
            <span>180°/s</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-white/80 font-mono text-sm">
              🎯 最大探测距离
            </label>
            <span className="text-sonar-scan font-mono text-sm bg-sonar-scan/10 px-2 py-1 rounded">
              {params.maxRange}m
            </span>
          </div>
          <input
            type="range"
            min="100"
            max="2000"
            step="100"
            value={params.maxRange}
            onChange={(e) => onParamsChange({ maxRange: Number(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          />
          <div className="flex justify-between text-xs text-gray-500 font-mono">
            <span>100m</span>
            <span>2000m</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-white/80 font-mono text-sm">
              🔊 噪声水平
            </label>
            <span className="text-sonar-scan font-mono text-sm bg-sonar-scan/10 px-2 py-1 rounded">
              {params.noiseLevel}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            value={params.noiseLevel}
            onChange={(e) => onParamsChange({ noiseLevel: Number(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          />
          <div className="flex justify-between text-xs text-gray-500 font-mono">
            <span>无噪声</span>
            <span>高噪声</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-white/80 font-mono text-sm">
              🌊 距离分辨率
            </label>
            <span className="text-sonar-scan font-mono text-sm bg-sonar-scan/10 px-2 py-1 rounded">
              {(params.distanceResolution * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0.01"
            max="0.1"
            step="0.005"
            value={params.distanceResolution}
            onChange={(e) => onParamsChange({ distanceResolution: Number(e.target.value) })}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          />
          <div className="flex justify-between text-xs text-gray-500 font-mono">
            <span>高分辨率</span>
            <span>低分辨率</span>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-black/30 rounded-lg">
          <label className="text-white/80 font-mono text-sm">
            🪨 海底回波
          </label>
          <button
            onClick={() => onParamsChange({ bottomEchoEnabled: !params.bottomEchoEnabled })}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
              params.bottomEchoEnabled ? 'bg-sonar-scan' : 'bg-gray-600'
            }`}
          >
            <div
              className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform duration-300 ${
                params.bottomEchoEnabled ? 'translate-x-8' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-sonar-scan/30">
        <button
          onClick={onReset}
          className="w-full py-3 px-4 bg-gradient-to-r from-sonar-scan/20 to-sonar-scan/10 hover:from-sonar-scan/30 hover:to-sonar-scan/20 text-sonar-scan font-mono rounded-lg border border-sonar-scan/50 transition-all duration-300 hover:shadow-lg hover:shadow-sonar-scan/20"
        >
          🔄 重置模拟
        </button>
      </div>

      <div className="mt-6 p-4 bg-black/30 rounded-lg border border-gray-700/50">
        <h3 className="text-sm font-mono text-sonar-scan mb-3">📊 参数说明</h3>
        <ul className="space-y-2 text-xs text-gray-400 font-mono">
          <li><span className="text-sonar-scan">波束角</span>: 声波发射范围</li>
          <li><span className="text-sonar-scan">增益</span>: 信号放大倍数</li>
          <li><span className="text-sonar-scan">扫描速度</span>: 旋转扫描速度</li>
          <li><span className="text-sonar-scan">探测距离</span>: 最大测距范围</li>
          <li><span className="text-sonar-scan">噪声水平</span>: 环境干扰强度</li>
          <li><span className="text-sonar-scan">距离分辨率</span>: A显示精度</li>
        </ul>
      </div>

      <div className="mt-4 p-4 bg-black/30 rounded-lg border border-gray-700/50">
        <h3 className="text-sm font-mono text-sonar-scan mb-3">🎨 图例说明</h3>
        <ul className="space-y-2 text-xs text-gray-400 font-mono">
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
            <span><span className="text-yellow-400">黄色</span>: 鱼群目标</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500"></span>
            <span><span className="text-orange-400">橙色</span>: 海底回波</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-gray-400"></span>
            <span><span className="text-gray-400">灰色</span>: 噪声干扰</span>
          </li>
        </ul>
      </div>

      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #00ffaa;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(0, 255, 170, 0.5);
          transition: all 0.2s;
        }
        .slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 20px rgba(0, 255, 170, 0.8);
        }
        .slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #00ffaa;
          cursor: pointer;
          border: none;
          box-shadow: 0 0 10px rgba(0, 255, 170, 0.5);
        }
      `}</style>
    </div>
  );
};
