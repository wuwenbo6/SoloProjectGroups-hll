import { Info } from 'lucide-react';
import { useDataStore } from '../store/useDataStore';

export function KalmanParams() {
  const { kalmanParams, setKalmanParams, tags, isProcessing } = useDataStore();

  const basicParams = [
    {
      key: 'processNoise' as const,
      label: '过程噪声 Q',
      min: 0.0001,
      max: 0.1,
      step: 0.0001,
      description: '模型预测的不确定性，值越小滤波越平滑但响应越慢',
    },
    {
      key: 'measurementNoise' as const,
      label: '初始测量噪声 R₀',
      min: 0.001,
      max: 1,
      step: 0.001,
      description: '传感器测量噪声初始值，自适应模式下会在线调整',
    },
    {
      key: 'estimationError' as const,
      label: '初始估计误差 P₀',
      min: 0.1,
      max: 10,
      step: 0.1,
      description: '初始状态估计的不确定性，通常设为1',
    },
  ];

  const adaptiveParams = [
    {
      key: 'forgettingFactor' as const,
      label: '遗忘因子 α',
      min: 0.5,
      max: 0.99,
      step: 0.01,
      description: '自适应R估计的遗忘因子，值越大对历史数据权重越高',
    },
    {
      key: 'lagCompensation' as const,
      label: '滞后补偿因子 β',
      min: 0,
      max: 1,
      step: 0.05,
      description: '滤波输出的相位滞后补偿，通过趋势外推减少延迟',
    },
  ];

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
      <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-cyan-400 rounded-full"></span>
        卡尔曼滤波参数
      </h3>

      <div className="mb-5 p-3 bg-slate-900/50 rounded-lg border border-slate-600">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
            自适应 R 矩阵估计
            <div className="group relative">
              <Info className="w-4 h-4 text-slate-500 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-slate-900 text-xs text-slate-300 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border border-slate-600 shadow-xl z-10">
                启用后，系统将根据创新序列（实际测量与预测值的差异）在线估计测量噪声协方差R，更好地应对时变噪声环境
              </div>
            </div>
          </label>
          <button
            onClick={() => setKalmanParams({ adaptiveEnabled: !kalmanParams.adaptiveEnabled })}
            disabled={tags.length === 0 || isProcessing}
            className={`relative w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-50 ${
              kalmanParams.adaptiveEnabled ? 'bg-cyan-500' : 'bg-slate-600'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                kalmanParams.adaptiveEnabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {kalmanParams.adaptiveEnabled && (
          <div className="mt-2 text-xs text-cyan-400 flex items-center gap-1">
            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
            自适应模式已启用，测量噪声将在线动态调整
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">基础参数</p>
          <div className="space-y-4">
            {basicParams.map((param) => (
              <div key={param.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    {param.label}
                    <div className="group relative">
                      <Info className="w-4 h-4 text-slate-500 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-xs text-slate-300 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border border-slate-600 shadow-xl z-10">
                        {param.description}
                      </div>
                    </div>
                  </label>
                  <input
                    type="number"
                    value={kalmanParams[param.key]}
                    onChange={(e) =>
                      setKalmanParams({ [param.key]: parseFloat(e.target.value) })
                    }
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    disabled={tags.length === 0 || isProcessing}
                    className="w-24 px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded-lg text-cyan-400 text-right focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                  />
                </div>
                <input
                  type="range"
                  value={kalmanParams[param.key]}
                  onChange={(e) =>
                    setKalmanParams({ [param.key]: parseFloat(e.target.value) })
                  }
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  disabled={tags.length === 0 || isProcessing}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed accent-cyan-500"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{param.min}</span>
                  <span>{param.max}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-700 pt-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
            高级参数
          </p>
          <div className="space-y-4">
            {adaptiveParams.map((param) => (
              <div key={param.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    {param.label}
                    <div className="group relative">
                      <Info className="w-4 h-4 text-slate-500 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-xs text-slate-300 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border border-slate-600 shadow-xl z-10">
                        {param.description}
                      </div>
                    </div>
                  </label>
                  <input
                    type="number"
                    value={kalmanParams[param.key]}
                    onChange={(e) =>
                      setKalmanParams({ [param.key]: parseFloat(e.target.value) })
                    }
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    disabled={tags.length === 0 || isProcessing}
                    className="w-24 px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded-lg text-cyan-400 text-right focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                  />
                </div>
                <input
                  type="range"
                  value={kalmanParams[param.key]}
                  onChange={(e) =>
                    setKalmanParams({ [param.key]: parseFloat(e.target.value) })
                  }
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  disabled={tags.length === 0 || isProcessing}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed accent-cyan-500"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{param.min}</span>
                  <span>{param.max}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
