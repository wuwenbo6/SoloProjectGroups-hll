import { Play, Pause, SkipForward, RotateCcw, Loader2 } from 'lucide-react';
import { useSimulationStore } from '../store/simulationStore';

export default function ControlPanel() {
  const {
    isLoading,
    isRunning,
    currentSlot,
    config,
    stepSimulation,
    runSimulation,
    resetSimulation,
    initSimulation,
  } = useSimulationStore();

  const canStep = currentSlot < config.numSlots && !isRunning;
  const canRun = currentSlot < config.numSlots && !isRunning;
  const isComplete = currentSlot >= config.numSlots;

  return (
    <div className="config-panel rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                isRunning
                  ? 'bg-emerald-400 running-indicator'
                  : isComplete
                  ? 'bg-amber-400'
                  : 'bg-slate-500'
              }`}
            />
            <span className="text-sm text-slate-300">
              {isRunning ? '运行中...' : isComplete ? '已完成' : '就绪'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">进度:</span>
            <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-blue-500 transition-all duration-300"
                style={{ width: `${(currentSlot / config.numSlots) * 100}%` }}
              />
            </div>
            <span className="text-primary font-mono font-bold">
              {currentSlot}/{config.numSlots}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={stepSimulation}
            disabled={!canStep || isLoading}
            className="btn-secondary text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SkipForward className="w-4 h-4" />
            单步
          </button>

          <button
            onClick={runSimulation}
            disabled={!canRun || isLoading}
            className="btn-primary text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isRunning ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isRunning ? '运行中' : '运行'}
          </button>

          <button
            onClick={() => {
              resetSimulation();
              initSimulation();
            }}
            disabled={isLoading && !isComplete}
            className="btn-secondary text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            重置
          </button>
        </div>
      </div>
    </div>
  );
}
