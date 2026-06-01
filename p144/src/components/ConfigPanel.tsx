import { Settings, Users, Layers, Radio, Signal, Gauge, Wifi, Zap, Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { useSimulationStore } from '../store/simulationStore';
import { USER_COLORS, getUserName, BSS_COLORS, getBSSName } from '@shared/types';

export default function ConfigPanel() {
  const { config, setConfig, compareAlgorithms, isLoading } = useSimulationStore();

  const exportReport = async (format: 'json' | 'csv') => {
    try {
      const response = await fetch(`/api/simulation/report?format=${format}`);
      if (format === 'csv') {
        const csv = await response.text();
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `simulation_report_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data.report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `simulation_report_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="config-panel rounded-xl border border-slate-700 p-4 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-700">
        <Settings className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-white">参数配置</h2>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <Users className="w-4 h-4" />
            用户数量: <span className="text-primary font-mono">{config.numUsers}</span>
          </label>
          <input
            type="range"
            min="2"
            max="10"
            value={config.numUsers}
            onChange={(e) => setConfig({ numUsers: parseInt(e.target.value) })}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>2</span>
            <span>10</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <Layers className="w-4 h-4" />
            资源块数量: <span className="text-primary font-mono">{config.numRBs}</span>
          </label>
          <input
            type="range"
            min="8"
            max="50"
            step="2"
            value={config.numRBs}
            onChange={(e) => setConfig({ numRBs: parseInt(e.target.value) })}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>8</span>
            <span>50</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <Gauge className="w-4 h-4" />
            时隙总数: <span className="text-primary font-mono">{config.numSlots}</span>
          </label>
          <input
            type="range"
            min="50"
            max="500"
            step="10"
            value={config.numSlots}
            onChange={(e) => setConfig({ numSlots: parseInt(e.target.value) })}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>50</span>
            <span>500</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <Signal className="w-4 h-4" />
            SNR范围: <span className="text-primary font-mono">{config.snrMin} ~ {config.snrMax} dB</span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="-10"
              max="30"
              value={config.snrMin}
              onChange={(e) => setConfig({ snrMin: parseInt(e.target.value) })}
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
            />
            <input
              type="number"
              min="-10"
              max="30"
              value={config.snrMax}
              onChange={(e) => setConfig({ snrMax: parseInt(e.target.value) })}
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <Radio className="w-4 h-4" />
            信道模型
          </label>
          <select
            value={config.channelModel.type}
            onChange={(e) => setConfig({
              channelModel: { ...config.channelModel, type: e.target.value as any }
            })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
          >
            <option value="AWGN">AWGN (高斯白噪声)</option>
            <option value="Rayleigh">Rayleigh (瑞利衰落)</option>
            <option value="Rician">Rician (莱斯衰落)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            调度算法
          </label>
          <select
            value={config.algorithm}
            onChange={(e) => setConfig({ algorithm: e.target.value as any })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
          >
            <option value="fair">公平调度 (Proportional Fair)</option>
            <option value="maxThroughput">最大吞吐 (Max Throughput)</option>
            <option value="roundRobin">轮询调度 (Round Robin)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            MIMO模式
          </label>
          <select
            value={config.mimoMode}
            onChange={(e) => setConfig({ mimoMode: e.target.value as any })}
            className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
          >
            <option value="SU">SU-MIMO (单用户)</option>
            <option value="MU">MU-MIMO (多用户配对)</option>
          </select>
        </div>

        {config.mimoMode === 'MU' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              最大MIMO层数: <span className="text-primary font-mono">{config.maxMimoLayers}</span>
            </label>
            <input
              type="range"
              min="2"
              max="4"
              value={config.maxMimoLayers}
              onChange={(e) => setConfig({ maxMimoLayers: parseInt(e.target.value) })}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>2层</span>
              <span>4层</span>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-700">
          <button
            onClick={() => compareAlgorithms('fair', 'maxThroughput')}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-gradient-to-r from-fair-algo to-max-algo text-white font-bold rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
          >
            🔄 对比: 公平调度 vs 最大吞吐
          </button>
        </div>

        <div className="pt-4 border-t border-slate-700 space-y-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <Wifi className="w-4 h-4 text-purple-400" />
              BSS着色 (空间复用)
            </label>
            <button
              onClick={() => setConfig({ enableBSSColoring: !config.enableBSSColoring })}
              className={`w-12 h-6 rounded-full transition-all ${
                config.enableBSSColoring ? 'bg-purple-500' : 'bg-slate-600'
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  config.enableBSSColoring ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {config.enableBSSColoring && (
            <div className="space-y-2 pl-4">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                BSS数量: <span className="text-purple-400 font-mono">{config.numBSS}</span>
              </label>
              <input
                type="range"
                min="2"
                max="6"
                value={config.numBSS}
                onChange={(e) => setConfig({ numBSS: parseInt(e.target.value) })}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>2</span>
                <span>6</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-2">
                {Array.from({ length: config.numBSS }).map((_, i) => (
                  <div key={i} className="flex items-center gap-1 text-xs">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: BSS_COLORS[i % BSS_COLORS.length] }}
                    />
                    <span className="text-slate-400">{getBSSName(i)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-700 space-y-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <Zap className="w-4 h-4 text-emerald-400" />
              节电管理 (Power Save)
            </label>
            <button
              onClick={() => setConfig({ enablePowerSave: !config.enablePowerSave })}
              className={`w-12 h-6 rounded-full transition-all ${
                config.enablePowerSave ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  config.enablePowerSave ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {config.enablePowerSave && (
            <div className="space-y-2 pl-4">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                占空比: <span className="text-emerald-400 font-mono">{(config.psmDutyCycle * 100).toFixed(0)}%</span>
              </label>
              <input
                type="range"
                min="10"
                max="100"
                step="10"
                value={config.psmDutyCycle * 100}
                onChange={(e) => setConfig({ psmDutyCycle: parseInt(e.target.value) / 100 })}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider-thumb"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>10%</span>
                <span>100%</span>
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-700 space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Download className="w-4 h-4" />
            导出仿真报告
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => exportReport('json')}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 py-2 px-3 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-all disabled:opacity-50"
            >
              <FileJson className="w-4 h-4" />
              JSON
            </button>
            <button
              onClick={() => exportReport('csv')}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 py-2 px-3 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-all disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-700">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">用户图例</h3>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: config.numUsers }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: USER_COLORS[i % USER_COLORS.length] }}
                />
                <span className="text-xs text-slate-400">{getUserName(i)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
