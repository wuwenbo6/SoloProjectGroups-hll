import React, { useState, useCallback, useMemo } from 'react';
import { useSimulationStore, useAPIService } from '../store/useSimulationStore';
import { formatTime, formatPercentage, getStatusLabel, getStatusBgColor } from '../utils/format';
import { Play, Pause, RotateCcw, Users, Wifi, Settings, Handshake, Radio, Trash2 } from 'lucide-react';
import type { TWTParams } from '../../shared/types';

export const ControlPanel: React.FC = () => {
  const state = useSimulationStore((state) => state.state);
  const isConnected = useSimulationStore((state) => state.isConnected);
  const setShowSleepSlots = useSimulationStore((state) => state.setShowSleepSlots);
  const setShowTransitionSlots = useSimulationStore((state) => state.setShowTransitionSlots);
  const showSleepSlots = useSimulationStore((state) => state.showSleepSlots);
  const showTransitionSlots = useSimulationStore((state) => state.showTransitionSlots);
  const api = useAPIService();

  const [staCount, setStaCount] = useState(4);
  const [wakeInterval, setWakeInterval] = useState(500);
  const [wakeDuration, setWakeDuration] = useState(20);
  const [simulationDuration, setSimulationDuration] = useState(10000);
  const [speed, setSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedSTAForGroup, setSelectedSTAForGroup] = useState<string[]>([]);

  const { isRunning, currentTime, duration, stas, overallSavingRatio } = useMemo(() => {
    if (!state) {
      return {
        isRunning: false,
        currentTime: 0,
        duration: 10000,
        stas: [],
        overallSavingRatio: 0,
      };
    }
    return state;
  }, [state]);

  const handleStart = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.startSimulation();
    } catch (error) {
      console.error('Failed to start simulation:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const handlePause = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.pauseSimulation();
    } catch (error) {
      console.error('Failed to pause simulation:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const handleReset = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.resetSimulation();
    } catch (error) {
      console.error('Failed to reset simulation:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const handleNegotiate = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.negotiate();
      useSimulationStore.getState().setNegotiationLogs(result.logs);
    } catch (error) {
      console.error('Failed to negotiate:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const handleApplyConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const defaultTWTParams: TWTParams = {
        wakeInterval,
        wakeDuration,
        wakeOffset: 0,
      };
      await api.updateConfig({
        duration: simulationDuration,
        speed,
        staCount,
        defaultTWTParams,
      });
      useSimulationStore.getState().setViewRange({ start: 0, end: simulationDuration });
    } catch (error) {
      console.error('Failed to apply config:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api, wakeInterval, wakeDuration, simulationDuration, speed, staCount]);

  const handleSpeedChange = useCallback(
    async (newSpeed: number) => {
      setSpeed(newSpeed);
      try {
        await api.setSpeed(newSpeed);
      } catch (error) {
        console.error('Failed to set speed:', error);
      }
    },
    [api]
  );

  const handleSeek = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseInt(e.target.value);
      try {
        await api.seekTo(time);
      } catch (error) {
        console.error('Failed to seek:', error);
      }
    },
    [api]
  );

  const handleAddSTA = useCallback(async () => {
    try {
      await api.addSTA();
    } catch (error) {
      console.error('Failed to add STA:', error);
    }
  }, [api]);

  const handleAddSTABatch = useCallback(async () => {
    try {
      setIsLoading(true);
      await api.addSTABatch(staCount);
    } catch (error) {
      console.error('Failed to add STAs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api, staCount]);

  const handleRemoveSTA = useCallback(
    async (id: string) => {
      try {
        await api.deleteSTA(id);
      } catch (error) {
        console.error('Failed to remove STA:', error);
      }
    },
    [api]
  );

  const handleCreateGroup = useCallback(async () => {
    if (selectedSTAForGroup.length < 1) return;
    try {
      setIsLoading(true);
      await api.createGroup(
        newGroupName || `广播组-${(state?.twtGroups?.length || 0) + 1}`,
        { wakeInterval, wakeDuration, wakeOffset: 0 },
        selectedSTAForGroup
      );
      setNewGroupName('');
      setSelectedSTAForGroup([]);
    } catch (error) {
      console.error('Failed to create group:', error);
    } finally {
      setIsLoading(false);
    }
  }, [api, newGroupName, selectedSTAForGroup, wakeInterval, wakeDuration, state?.twtGroups]);

  const handleRemoveGroup = useCallback(
    async (groupId: string) => {
      try {
        await api.deleteGroup(groupId);
      } catch (error) {
        console.error('Failed to remove group:', error);
      }
    },
    [api]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Wifi className="w-5 h-5 text-cyan-400" />
            模拟控制
          </h3>
          <div
            className={`flex items-center gap-2 text-sm ${
              isConnected ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
              }`}
            />
            {isConnected ? '已连接' : '未连接'}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <button
              onClick={isRunning ? handlePause : handleStart}
              disabled={isLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all ${
                isRunning
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-900'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isRunning ? (
                <>
                  <Pause className="w-5 h-5" />
                  暂停
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  开始
                </>
              )}
            </button>

            <button
              onClick={handleReset}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-5 h-5" />
              重置
            </button>

            <button
              onClick={handleNegotiate}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium bg-cyan-500 hover:bg-cyan-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Handshake className="w-5 h-5" />
              协商
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">模拟进度</span>
              <span className="text-slate-200 font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">模拟速度</span>
              <span className="text-slate-200 font-mono">{speed}x</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={20}
              step={0.1}
              value={speed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-violet-400" />
          参数配置
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">STA 数量</label>
              <input
                type="number"
                min={1}
                max={16}
                value={staCount}
                onChange={(e) => setStaCount(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">模拟时长 (ms)</label>
              <input
                type="number"
                min={1000}
                max={60000}
                step={1000}
                value={simulationDuration}
                onChange={(e) => setSimulationDuration(parseInt(e.target.value) || 10000)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              唤醒间隔 (ms): {wakeInterval}ms
            </label>
            <input
              type="range"
              min={100}
              max={5000}
              step={50}
              value={wakeInterval}
              onChange={(e) => setWakeInterval(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              唤醒时长 (ms): {wakeDuration}ms
            </label>
            <input
              type="range"
              min={5}
              max={200}
              step={1}
              value={wakeDuration}
              onChange={(e) => setWakeDuration(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          <div className="text-sm text-slate-500">
            占空比: {formatPercentage(wakeDuration / wakeInterval)}
          </div>

          <button
            onClick={handleApplyConfig}
            disabled={isLoading}
            className="w-full py-2 px-4 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            应用配置
          </button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            STA 列表
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={20}
              value={staCount}
              onChange={(e) => setStaCount(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-16 px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 focus:outline-none focus:border-emerald-500 text-center"
            />
            <button
              onClick={handleAddSTABatch}
              disabled={isLoading}
              className="text-sm px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
            >
              + 批量添加
            </button>
          </div>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {stas.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              暂无 STA，请先应用配置
            </div>
          ) : (
            stas.map((sta) => (
              <div
                key={sta.id}
                className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: sta.color }}
                  />
                  <div>
                    <div className="text-slate-200 font-medium">{sta.name}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      {sta.macAddress}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white ${getStatusBgColor(
                      sta.status
                    )}`}
                  >
                    {getStatusLabel(sta.status)}
                  </span>
                  {sta.negotiatedTWT && (
                    <span className="text-xs text-slate-400 font-mono">
                      {formatTime(sta.negotiatedTWT.wakeInterval)} /{' '}
                      {formatTime(sta.negotiatedTWT.wakeDuration)}
                    </span>
                  )}
                  <button
                    onClick={() => handleRemoveSTA(sta.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                    title="删除 STA"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" />
            广播 TWT 分组
          </h3>
        </div>

        {state?.twtGroups && state.twtGroups.length > 0 && (
          <div className="space-y-2 mb-4">
            {state.twtGroups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  <div>
                    <div className="text-slate-200 font-medium text-sm">{group.name}</div>
                    <div className="text-xs text-slate-500">
                      {group.staIds.length} 个 STA · 偏移 {group.twtParams.wakeOffset}ms
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveGroup(group.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">分组名称</label>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="例: 传感器组A"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              选择 STA (已选 {selectedSTAForGroup.length})
            </label>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {stas.filter(s => !s.groupId).map((sta) => (
                <label
                  key={sta.id}
                  className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-slate-800/50 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedSTAForGroup.includes(sta.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSTAForGroup([...selectedSTAForGroup, sta.id]);
                      } else {
                        setSelectedSTAForGroup(selectedSTAForGroup.filter(id => id !== sta.id));
                      }
                    }}
                    className="w-3 h-3"
                  />
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sta.color }} />
                  <span className="text-xs text-slate-300">{sta.name}</span>
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={handleCreateGroup}
            disabled={selectedSTAForGroup.length < 1 || isLoading}
            className="w-full py-2 px-4 bg-cyan-500/20 text-cyan-400 rounded-lg font-medium transition-all hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            创建广播组
          </button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">显示选项</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showSleepSlots}
              onChange={(e) => setShowSleepSlots(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-slate-300">显示睡眠时隙</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={showTransitionSlots}
              onChange={(e) => setShowTransitionSlots(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-slate-300">显示状态切换时隙</span>
          </label>
        </div>
      </div>

      <div className="bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 rounded-xl p-6 border border-cyan-500/30">
        <div className="text-center">
          <div className="text-sm text-slate-400 mb-1">预计总节能</div>
          <div className="text-4xl font-bold text-emerald-400 font-mono">
            {formatPercentage(overallSavingRatio)}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            相比无 TWT 持续唤醒模式
          </div>
        </div>
      </div>
    </div>
  );
};
