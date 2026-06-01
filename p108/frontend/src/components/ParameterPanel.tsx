import { useState, useEffect } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { fetchSavedParams, saveParams, deleteParams } from '../utils/api';

export function ParameterPanel() {
  const { params, state, setParams, setSimulationState, resetSimulation, setSavedParams, savedParams, error, setError } = useSimulationStore();
  const { connect, disconnect, sendMessage } = useWebSocket();
  const [saveName, setSaveName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  useEffect(() => {
    loadSavedParams();
  }, []);

  const loadSavedParams = async () => {
    try {
      const data = await fetchSavedParams();
      setSavedParams(data);
    } catch (e) {
      console.error('Failed to load saved params:', e);
    }
  };

  const handleStart = () => {
    setError(null);
    resetSimulation();
    setSimulationState({ isRunning: true });
    connect();
    
    setTimeout(() => {
      sendMessage({
        type: 'start',
        params: {
          undercooling: params.undercooling,
          anisotropy: params.anisotropy,
          anisotropy_mode: params.anisotropyMode,
          interface_width: params.interfaceWidth,
          mobility: params.mobility,
          num_grains: params.numGrains,
          grain_radius: params.grainRadius,
          random_orientation: params.randomOrientation,
          export_obj: params.exportObj,
          grid_size: 64,
          total_steps: 200,
        },
      });
    }, 500);
  };

  const handlePause = () => {
    setSimulationState({ isPaused: !state.isPaused });
    sendMessage({ type: state.isPaused ? 'resume' : 'pause' });
  };

  const handleStop = () => {
    setSimulationState({ isRunning: false, isPaused: false });
    sendMessage({ type: 'stop' });
    disconnect();
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    
    try {
      await saveParams(saveName, { name: saveName, ...params });
      setSaveName('');
      setShowSaveDialog(false);
      loadSavedParams();
    } catch (e) {
      console.error('Failed to save params:', e);
    }
  };

  const handleLoad = (saved: any) => {
    setParams({
      undercooling: saved.undercooling,
      anisotropy: saved.anisotropy,
      anisotropyMode: saved.anisotropyMode,
      interfaceWidth: saved.interfaceWidth,
      mobility: saved.mobility,
    });
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteParams(id);
      loadSavedParams();
    } catch (e) {
      console.error('Failed to delete params:', e);
    }
  };

  const SliderControl = ({ label, value, onChange, min, max, step, unit = '' }: any) => (
    <div className="mb-4">
      <div className="flex justify-between mb-1">
        <label className="text-slate-400 text-sm font-mono">{label}</label>
        <span className="text-secondary text-sm font-mono">{value.toFixed(2)}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={state.isRunning}
        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
      />
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-primary/95 backdrop-blur-sm border-r border-slate-700">
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-xl font-bold text-secondary font-orbitron tracking-wider">
          PHASEFIELD SIM
        </h1>
        <p className="text-slate-500 text-xs mt-1">金属凝固枝晶生长模拟器</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="mb-6">
          <h2 className="text-slate-300 text-sm font-bold mb-4 uppercase tracking-wider">
            模拟参数
          </h2>
          
          <SliderControl
            label="过冷度 ΔT"
            value={params.undercooling}
            onChange={(v: number) => setParams({ undercooling: v })}
            min={0.1}
            max={2.0}
            step={0.05}
            unit=" K"
          />
          
          <SliderControl
            label="各向异性强度"
            value={params.anisotropy}
            onChange={(v: number) => setParams({ anisotropy: v })}
            min={0.0}
            max={0.1}
            step={0.005}
          />
          
          <div className="mb-4">
            <label className="text-slate-400 text-sm font-mono block mb-2">
              各向异性模式
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setParams({ anisotropyMode: 4 })}
                disabled={state.isRunning}
                className={`flex-1 py-2 px-3 rounded text-sm font-mono transition-all ${
                  params.anisotropyMode === 4
                    ? 'bg-secondary text-primary'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                } disabled:opacity-50`}
              >
                立方体 (4重)
              </button>
              <button
                onClick={() => setParams({ anisotropyMode: 6 })}
                disabled={state.isRunning}
                className={`flex-1 py-2 px-3 rounded text-sm font-mono transition-all ${
                  params.anisotropyMode === 6
                    ? 'bg-secondary text-primary'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                } disabled:opacity-50`}
              >
                八面体 (6重)
              </button>
            </div>
          </div>
          
          <SliderControl
            label="界面宽度"
            value={params.interfaceWidth}
            onChange={(v: number) => setParams({ interfaceWidth: v })}
            min={1.0}
            max={5.0}
            step={0.1}
          />
          
          <SliderControl
            label="界面迁移率"
            value={params.mobility}
            onChange={(v: number) => setParams({ mobility: v })}
            min={0.1}
            max={2.0}
            step={0.1}
          />

          <div className="pt-4 border-t border-slate-700">
            <h3 className="text-slate-300 text-sm font-bold mb-4 uppercase tracking-wider">
              多晶设置
            </h3>
            
            <SliderControl
              label="晶粒数量"
              value={params.numGrains}
              onChange={(v: number) => setParams({ numGrains: Math.round(v) })}
              min={1}
              max={12}
              step={1}
            />
            
            <SliderControl
              label="晶核半径"
              value={params.grainRadius}
              onChange={(v: number) => setParams({ grainRadius: Math.round(v) })}
              min={1}
              max={8}
              step={1}
            />
            
            <div className="mb-4 flex items-center justify-between">
              <label className="text-slate-400 text-sm font-mono">
                随机取向
              </label>
              <button
                onClick={() => setParams({ randomOrientation: !params.randomOrientation })}
                disabled={state.isRunning}
                className={`w-12 h-6 rounded-full transition-all ${
                  params.randomOrientation
                    ? 'bg-secondary'
                    : 'bg-slate-600'
                } disabled:opacity-50`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    params.randomOrientation
                      ? 'translate-x-6'
                      : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            
            <div className="mb-4 flex items-center justify-between">
              <label className="text-slate-400 text-sm font-mono">
                导出OBJ序列
              </label>
              <button
                onClick={() => setParams({ exportObj: !params.exportObj })}
                disabled={state.isRunning}
                className={`w-12 h-6 rounded-full transition-all ${
                  params.exportObj
                    ? 'bg-secondary'
                    : 'bg-slate-600'
                } disabled:opacity-50`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    params.exportObj
                      ? 'translate-x-6'
                      : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            
            {params.exportObj && (
              <p className="text-yellow-500 text-xs mb-2">
                ⚠️ OBJ导出会增加计算时间和磁盘占用
              </p>
            )}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-slate-300 text-sm font-bold mb-4 uppercase tracking-wider">
            模拟控制
          </h2>
          
          <div className="grid grid-cols-2 gap-2">
            {!state.isRunning ? (
              <button
                onClick={handleStart}
                className="col-span-2 py-3 bg-secondary text-primary font-bold rounded-lg hover:bg-opacity-90 transition-all animate-pulse-glow"
              >
                ▶ 开始模拟
              </button>
            ) : (
              <>
                <button
                  onClick={handlePause}
                  className="py-3 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-500 transition-all"
                >
                  {state.isPaused ? '▶ 继续' : '⏸ 暂停'}
                </button>
                <button
                  onClick={handleStop}
                  className="py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-500 transition-all"
                >
                  ⏹ 停止
                </button>
              </>
            )}
          </div>
        </div>

        {state.isRunning && (
          <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="flex justify-between mb-2">
              <span className="text-slate-400 text-sm">进度</span>
              <span className="text-secondary text-sm font-mono">
                {state.currentStep} / {state.totalSteps}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-secondary to-accent transition-all duration-300"
                style={{ width: `${state.progress * 100}%` }}
              />
            </div>
            <div className="mt-3 flex justify-between text-xs">
              <span className="text-slate-500">自由能:</span>
              <span className="text-accent font-mono">
                {state.freeEnergy.toExponential(2)}
              </span>
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-slate-300 text-sm font-bold uppercase tracking-wider">
              已保存配置
            </h2>
            <button
              onClick={() => setShowSaveDialog(!showSaveDialog)}
              className="text-secondary text-sm hover:underline"
            >
              + 保存当前
            </button>
          </div>

          {showSaveDialog && (
            <div className="mb-3 p-3 bg-slate-800 rounded-lg border border-slate-600">
              <input
                type="text"
                placeholder="配置名称..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm mb-2 focus:outline-none focus:border-secondary"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex-1 py-1 bg-secondary text-primary text-sm rounded hover:bg-opacity-90"
                >
                  保存
                </button>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="flex-1 py-1 bg-slate-600 text-white text-sm rounded hover:bg-slate-500"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {savedParams.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">
                暂无保存的配置
              </p>
            ) : (
              savedParams.map((saved) => (
                <div
                  key={saved.id}
                  className="p-2 bg-slate-800/50 rounded border border-slate-700 flex justify-between items-center"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 text-sm font-mono truncate">
                      {saved.name}
                    </p>
                    <p className="text-slate-500 text-xs">
                      ΔT={saved.undercooling} ε={saved.anisotropy}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => handleLoad(saved)}
                      disabled={state.isRunning}
                      className="px-2 py-1 bg-slate-600 text-xs rounded hover:bg-slate-500 disabled:opacity-50"
                    >
                      加载
                    </button>
                    <button
                      onClick={() => saved.id && handleDelete(saved.id)}
                      className="px-2 py-1 bg-red-900/50 text-red-400 text-xs rounded hover:bg-red-800"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-700 text-center">
        <p className="text-slate-600 text-xs">
          相场模型 · Kobayashi枝晶生长
        </p>
      </div>
    </div>
  );
}
