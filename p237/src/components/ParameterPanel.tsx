import { useSimulationStore } from '@/hooks/useSimulation';
import { Play, RotateCcw, Settings2, AlertTriangle } from 'lucide-react';

export default function ParameterPanel() {
  const { params, setParams, run, reset, isRunning, result, amplitudeWarning, effectiveAmplitude } = useSimulationStore();

  const fields = [
    { key: 'signalFrequency', label: '信号频率', unit: 'Hz', min: 100, max: 10000, step: 100 },
    { key: 'signalAmplitude', label: '信号幅度', unit: '', min: 0.05, max: 0.95, step: 0.05 },
    { key: 'oversampleRatio', label: '过采样率 (OSR)', unit: '', min: 4, max: 256, step: 1 },
    { key: 'numCycles', label: '仿真周期数', unit: '', min: 8, max: 256, step: 8 },
    { key: 'samplesPerCycle', label: '每周期采样点', unit: '', min: 32, max: 512, step: 32 },
  ] as const;

  return (
    <div className="flex flex-col gap-5 h-full">
      <div className="flex items-center gap-2 text-slate-200">
        <Settings2 size={16} className="text-blue-400" />
        <h2 className="text-sm font-semibold tracking-wide uppercase">参数配置</h2>
      </div>

      <div className="flex flex-col gap-4 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-slate-400 font-medium">调制器结构</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setParams({ order: 1 })}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                params.order === 1
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <div className="font-bold">1 阶</div>
              <div className="text-[10px] opacity-70">标准结构</div>
            </button>
            <button
              onClick={() => setParams({ order: 2 })}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                params.order === 2
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <div className="font-bold">2 阶</div>
              <div className="text-[10px] opacity-70">CRFF 结构</div>
            </button>
          </div>
        </div>

        {fields.map((field) => (
          <div key={field.key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400 font-medium">{field.label}</label>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded ${
                  field.key === 'signalAmplitude' && params.signalAmplitude > 0.7
                    ? 'text-amber-300 bg-amber-950/50'
                    : 'text-blue-300 bg-blue-950/50'
                }`}
              >
                {params[field.key]}{field.unit ? ` ${field.unit}` : ''}
              </span>
            </div>
            <input
              type="range"
              min={field.min}
              max={field.max}
              step={field.step}
              value={params[field.key]}
              onChange={(e) => setParams({ [field.key]: parseFloat(e.target.value) })}
              className={`w-full h-1.5 rounded-full appearance-none cursor-pointer
                ${field.key === 'signalAmplitude' && params.signalAmplitude > 0.7
                  ? 'bg-amber-900/50'
                  : 'bg-slate-700'
                }
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125
                ${field.key === 'signalAmplitude' && params.signalAmplitude > 0.7
                  ? '[&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow-amber-500/30'
                  : '[&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-blue-500/30'
                }`}
            />
          </div>
        ))}

        {amplitudeWarning && (
          <div className="flex items-start gap-2 p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-amber-300">幅度过高已自动衰减</span>
              <span className="text-[11px] text-amber-400/70">
                输入幅度 {params.signalAmplitude} 超过安全值 0.7
                <br />
                实际仿真使用: <span className="font-mono text-amber-300">{effectiveAmplitude}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className="flex flex-col gap-2 p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
          <div className="text-xs text-slate-400">采样率</div>
          <div className="text-sm font-mono text-emerald-400">
            {result.sampleRate >= 1e6
              ? `${(result.sampleRate / 1e6).toFixed(2)} MHz`
              : `${(result.sampleRate / 1e3).toFixed(1)} kHz`}
          </div>
          <div className="text-xs text-slate-400">总采样点</div>
          <div className="text-sm font-mono text-emerald-400">{result.totalSamples.toLocaleString()}</div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={run}
          disabled={isRunning}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5
            bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-wait
            text-white text-sm font-medium rounded-lg transition-all duration-200
            shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 hover:scale-[1.02]
            active:scale-[0.98]"
        >
          <Play size={14} />
          {isRunning ? '仿真中...' : '运行仿真'}
        </button>
        <button
          onClick={reset}
          className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300
            text-sm rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
}
