import React, { useMemo } from 'react';
import { useSimulationStore } from '../store/useSimulationStore';
import {
  formatPower,
  formatEnergy,
  formatPercentage,
  getStatusColor,
  getStatusLabel,
} from '../utils/format';
import { Zap, TrendingDown, Battery, Activity } from 'lucide-react';

export const PowerStats: React.FC = () => {
  const state = useSimulationStore((state) => state.state);
  const selectedSTAId = useSimulationStore((state) => state.selectedSTAId);

  const {
    overallSavingRatio,
    totalEnergyConsumed,
    totalEnergySaved,
    stas,
    powerStats,
    currentTime,
    isRunning,
  } = useMemo(() => {
    if (!state) {
      return {
        overallSavingRatio: 0,
        totalEnergyConsumed: 0,
        totalEnergySaved: 0,
        stas: [],
        powerStats: [],
        currentTime: 0,
        isRunning: false,
      };
    }
    return state;
  }, [state]);

  const selectedSTA = useMemo(() => {
    if (!selectedSTAId) return null;
    return stas.find((s) => s.id === selectedSTAId);
  }, [selectedSTAId, stas]);

  const selectedSTAPower = useMemo(() => {
    if (!selectedSTAId) return null;
    return powerStats.find((p) => p.staId === selectedSTAId);
  }, [selectedSTAId, powerStats]);

  const maxAwakePower = useMemo(() => {
    if (stas.length === 0) return 200;
    return Math.max(...stas.map((s) => s.powerProfile.awakePower)) * 1.1;
  }, [stas]);

  const totalBaselineEnergy = useMemo(() => {
    return totalEnergyConsumed + totalEnergySaved;
  }, [totalEnergyConsumed, totalEnergySaved]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <Zap className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-slate-400 text-sm">总能耗</span>
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {formatEnergy(totalEnergyConsumed)}
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <TrendingDown className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-slate-400 text-sm">节省能耗</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">
            {formatEnergy(totalEnergySaved)}
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Battery className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-slate-400 text-sm">节省比例</span>
          </div>
          <div className="text-2xl font-bold text-amber-400 font-mono">
            {formatPercentage(overallSavingRatio)}
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <Activity className="w-5 h-5 text-violet-400" />
            </div>
            <span className="text-slate-400 text-sm">模拟时间</span>
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {formatTime(currentTime)}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">整体节能效果</h3>
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-400">无 TWT 基线能耗</span>
            <span className="text-slate-300 font-mono">{formatEnergy(totalBaselineEnergy)}</span>
          </div>
          <div className="h-6 bg-slate-700 rounded-full overflow-hidden relative">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-slate-500 to-slate-400 transition-all duration-500"
              style={{ width: '100%' }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
              style={{ width: `${(1 - overallSavingRatio) * 100}%` }}
            />
            <div
              className="absolute inset-y-0 bg-gradient-to-r from-emerald-500/30 to-cyan-500/30 transition-all duration-500 border-r-2 border-dashed border-emerald-400"
              style={{
                left: `${(1 - overallSavingRatio) * 100}%`,
                width: `${overallSavingRatio * 100}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs mt-2">
            <span className="text-emerald-400">实际能耗: {formatEnergy(totalEnergyConsumed)}</span>
            <span className="text-amber-400">节省: {formatEnergy(totalEnergySaved)} ({formatPercentage(overallSavingRatio)})</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">各 STA 功耗对比</h3>
        <div className="space-y-4">
          {stas.map((sta) => {
            const powerData = powerStats.find((p) => p.staId === sta.id);
            const savingRatio = powerData?.savingRatio || 0;
            const isSelected = selectedSTAId === sta.id;

            return (
              <div
                key={sta.id}
                className={`p-4 rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-slate-800 border-cyan-500'
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: sta.color }}
                    />
                    <span className="font-medium text-slate-100">{sta.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(sta.status)} bg-slate-700`}>
                      {getStatusLabel(sta.status)}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-400">节能</div>
                    <div className="text-emerald-400 font-mono font-semibold">
                      {formatPercentage(savingRatio)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                  <div>
                    <div className="text-slate-500 text-xs">唤醒功耗</div>
                    <div className="text-slate-200 font-mono">
                      {formatPower(sta.powerProfile.awakePower)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs">睡眠功耗</div>
                    <div className="text-slate-200 font-mono">
                      {formatPower(sta.powerProfile.sleepPower)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs">当前功耗</div>
                    <div className="text-cyan-400 font-mono">
                      {formatPower(powerData?.currentPower || sta.powerProfile.awakePower)}
                    </div>
                  </div>
                </div>

                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-slate-500 to-slate-400 transition-all duration-300"
                    style={{ width: '100%' }}
                  />
                  <div
                    className="h-full -mt-3 bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300"
                    style={{ width: `${(1 - savingRatio) * 100}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs mt-2 text-slate-500">
                  <span>基线: {formatEnergy(powerData?.baselineEnergy || 0)}</span>
                  <span>实际: {formatEnergy(powerData?.totalEnergy || 0)}</span>
                  <span className="text-emerald-400">
                    节省: {formatEnergy(powerData?.savedEnergy || 0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedSTA && selectedSTAPower && (
        <div className="bg-slate-900 rounded-xl p-6 border border-cyan-500/50">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">
            <span style={{ color: selectedSTA.color }}>{selectedSTA.name}</span> 详细信息
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="text-slate-500 text-xs mb-1">TWT 周期</div>
              <div className="text-slate-200 font-mono">
                {selectedSTA.negotiatedTWT
                  ? formatTime(selectedSTA.negotiatedTWT.wakeInterval)
                  : '-'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">唤醒时长</div>
              <div className="text-slate-200 font-mono">
                {selectedSTA.negotiatedTWT
                  ? formatTime(selectedSTA.negotiatedTWT.wakeDuration)
                  : '-'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">偏移量</div>
              <div className="text-slate-200 font-mono">
                {selectedSTA.negotiatedTWT
                  ? formatTime(selectedSTA.negotiatedTWT.wakeOffset)
                  : '-'}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">MAC 地址</div>
              <div className="text-slate-200 font-mono text-xs">
                {selectedSTA.macAddress}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700">
            <div className="text-slate-500 text-xs mb-2">功耗占比图</div>
            <div className="h-8 rounded-lg overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 flex items-center justify-center"
                style={{
                  width: `${(selectedSTAPower.totalEnergy / (selectedSTAPower.baselineEnergy || 1)) * 100}%`,
                }}
              >
                <span className="text-xs text-white font-medium">唤醒</span>
              </div>
              <div
                className="h-full bg-slate-500 flex items-center justify-center"
                style={{
                  width: `${((selectedSTAPower.baselineEnergy - selectedSTAPower.totalEnergy) / (selectedSTAPower.baselineEnergy || 1)) * 100}%`,
                }}
              >
                <span className="text-xs text-white font-medium">睡眠</span>
              </div>
            </div>
            <div className="flex justify-between text-xs mt-2 text-slate-500">
              <span className="text-emerald-400">
                唤醒能耗: {formatEnergy(selectedSTAPower.totalEnergy)}
              </span>
              <span>
                占空比: {formatPercentage(
                  selectedSTA.negotiatedTWT
                    ? selectedSTA.negotiatedTWT.wakeDuration / selectedSTA.negotiatedTWT.wakeInterval
                    : 0
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
