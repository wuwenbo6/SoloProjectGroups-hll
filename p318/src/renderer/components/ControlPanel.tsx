import React from 'react';
import { Play, Pause, RotateCcw, Plus, Download } from 'lucide-react';
import { useSimStore } from '../store/useSimStore';
import type { BusMode } from '../../shared/types';

export const ControlPanel: React.FC = () => {
  const busState = useSimStore((s) => s.busState);
  const busConfig = useSimStore((s) => s.busConfig);
  const utilization = useSimStore((s) => s.utilization);
  const startSimulation = useSimStore((s) => s.startSimulation);
  const pauseSimulation = useSimStore((s) => s.pauseSimulation);
  const resetSimulation = useSimStore((s) => s.resetSimulation);
  const addNode = useSimStore((s) => s.addNode);
  const updateBusConfig = useSimStore((s) => s.updateBusConfig);
  const setBusMode = useSimStore((s) => s.setBusMode);
  const exportData = useSimStore((s) => s.exportData);

  const handleStart = () => {
    startSimulation();
  };

  const handlePause = () => {
    pauseSimulation();
  };

  const handleReset = () => {
    resetSimulation();
  };

  const handleAddNode = () => {
    addNode();
  };

  const handleConfigChange = (key: keyof typeof busConfig, value: number) => {
    updateBusConfig({ [key]: value });
  };

  const handleModeChange = (mode: BusMode) => {
    setBusMode(mode);
  };

  const handleExport = async () => {
    const result = await exportData();
    if (result.success) {
      console.log('Export success:', result.path);
    }
  };

  return (
    <div className="card p-4 h-full overflow-y-auto scrollbar-thin">
      <h2 className="text-lg font-semibold mb-4 text-slate-100 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        控制面板
      </h2>

      <div className="flex flex-wrap gap-3 mb-5">
        {!busState.isRunning ? (
          <button className="btn btn-success btn-lg flex-1 min-w-[120px]" onClick={handleStart}>
            <Play size={18} />
            开始模拟
          </button>
        ) : (
          <button className="btn btn-warning btn-lg flex-1 min-w-[120px]" onClick={handlePause}>
            <Pause size={18} />
            暂停模拟
          </button>
        )}
        <button
          className="btn btn-secondary btn-lg"
          onClick={handleReset}
          title="重置所有状态"
        >
          <RotateCcw size={18} />
          重置
        </button>
        <button
          className="btn btn-primary btn-lg"
          onClick={handleAddNode}
          disabled={busState.isRunning}
          title="添加新节点"
        >
          <Plus size={18} />
          添加节点
        </button>
        <button
          className="btn btn-secondary btn-lg"
          onClick={handleExport}
          title="导出统计数据"
        >
          <Download size={18} />
          导出
        </button>
      </div>

      <div className="mb-5">
        <label className="block text-sm text-slate-300 mb-2 font-medium">总线模式</label>
        <div className="flex gap-2">
          <button
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              busConfig.mode === 'csma'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
            }`}
            onClick={() => handleModeChange('csma')}
            disabled={busState.isRunning}
          >
            CSMA/CD
          </button>
          <button
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              busConfig.mode === 'modbus-rtu'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
            }`}
            onClick={() => handleModeChange('modbus-rtu')}
            disabled={busState.isRunning}
          >
            Modbus RTU
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {busConfig.mode === 'csma'
            ? '多主对等模式，节点竞争发送'
            : '主从模式，主站轮询从站'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-slate-400 mb-2">
            波特率: <span className="font-mono text-blue-400">{busConfig.baudRate}</span>
          </label>
          <input
            type="range"
            className="slider w-full"
            min="1200"
            max="115200"
            step="1200"
            value={busConfig.baudRate}
            onChange={(e) => handleConfigChange('baudRate', Number(e.target.value))}
            disabled={busState.isRunning}
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>1200</span>
            <span>115200</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">
            仲裁等待时间: <span className="font-mono text-blue-400">{busConfig.arbitrateWaitTime}ms</span>
          </label>
          <input
            type="range"
            className="slider w-full"
            min="10"
            max="200"
            step="5"
            value={busConfig.arbitrateWaitTime}
            onChange={(e) => handleConfigChange('arbitrateWaitTime', Number(e.target.value))}
            disabled={busState.isRunning}
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>10ms</span>
            <span>200ms</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">
            最大重试次数: <span className="font-mono text-blue-400">{busConfig.maxRetries}</span>
          </label>
          <input
            type="range"
            className="slider w-full"
            min="1"
            max="10"
            step="1"
            value={busConfig.maxRetries}
            onChange={(e) => handleConfigChange('maxRetries', Number(e.target.value))}
            disabled={busState.isRunning}
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>1</span>
            <span>10</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">
            冲突检测时间: <span className="font-mono text-blue-400">{busConfig.collisionDetectTime}ms</span>
          </label>
          <input
            type="range"
            className="slider w-full"
            min="5"
            max="100"
            step="5"
            value={busConfig.collisionDetectTime}
            onChange={(e) => handleConfigChange('collisionDetectTime', Number(e.target.value))}
            disabled={busState.isRunning}
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>5ms</span>
            <span>100ms</span>
          </div>
        </div>

        {busConfig.mode === 'modbus-rtu' && (
          <>
            <div>
              <label className="block text-sm text-slate-400 mb-2">
                从站响应延迟: <span className="font-mono text-purple-400">{busConfig.modbusTurnaroundDelay}ms</span>
              </label>
              <input
                type="range"
                className="slider w-full"
                min="5"
                max="100"
                step="5"
                value={busConfig.modbusTurnaroundDelay}
                onChange={(e) => handleConfigChange('modbusTurnaroundDelay', Number(e.target.value))}
                disabled={busState.isRunning}
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>5ms</span>
                <span>100ms</span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">
                响应超时: <span className="font-mono text-purple-400">{busConfig.modbusResponseTimeout}ms</span>
              </label>
              <input
                type="range"
                className="slider w-full"
                min="50"
                max="1000"
                step="50"
                value={busConfig.modbusResponseTimeout}
                onChange={(e) => handleConfigChange('modbusResponseTimeout', Number(e.target.value))}
                disabled={busState.isRunning}
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>50ms</span>
                <span>1000ms</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300 mb-3">总线状态</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-slate-900/50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">运行状态</p>
            <p
              className={`font-semibold ${
                busState.isRunning ? 'text-green-400' : 'text-slate-400'
              }`}
            >
              {busState.isRunning ? '运行中' : '已停止'}
            </p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">总线状态</p>
            <p
              className={`font-semibold ${
                busState.isBusy ? 'text-amber-400' : 'text-green-400'
              }`}
            >
              {busState.isBusy ? '占用' : '空闲'}
            </p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500 mb-1">冲突检测</p>
            <p
              className={`font-semibold ${
                busState.conflictDetected ? 'text-red-400' : 'text-slate-400'
              }`}
            >
              {busState.conflictDetected ? '冲突!' : '正常'}
            </p>
          </div>
        </div>

        <h3 className="text-sm font-medium text-slate-300 mb-2">总线利用率</h3>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">当前利用率</span>
            <span className="text-lg font-mono font-bold text-cyan-400">
              {utilization.currentUtilization.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(utilization.currentUtilization, 100)}%`,
                backgroundColor:
                  utilization.currentUtilization > 80
                    ? '#F53F3F'
                    : utilization.currentUtilization > 50
                    ? '#FF7D00'
                    : '#14C9C9',
              }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-slate-500">平均</p>
              <p className="text-xs font-mono text-slate-300">{utilization.avgUtilization.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">峰值</p>
              <p className="text-xs font-mono text-slate-300">{utilization.peakUtilization.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">运行时间</p>
              <p className="text-xs font-mono text-slate-300">{(utilization.totalRuntime / 1000).toFixed(0)}s</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
