import { useEffect, useCallback } from 'react';
import { Settings, Activity, BarChart3, Zap } from 'lucide-react';
import ConfigPanel from './components/ConfigPanel';
import RBGridView from './components/RBGridView';
import StatisticsPanel from './components/StatisticsPanel';
import ControlPanel from './components/ControlPanel';
import ComparePanel from './components/ComparePanel';
import { useSimulationStore } from './store/simulationStore';

function App() {
  const { compareResult, initSimulation, config } = useSimulationStore();

  const init = useCallback(() => {
    initSimulation();
  }, [initSimulation]);

  useEffect(() => {
    init();
  }, [config.numUsers, config.numRBs, config.snrMin, config.snrMax, config.channelModel]);

  return (
    <div className="min-h-screen bg-secondary text-slate-200">
      <header className="bg-slate-800/50 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between max-w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">RU资源分配模拟器</h1>
              <p className="text-sm text-slate-400">多用户无线通信调度算法可视化</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-400" />
              <span className="text-slate-400">用户数:</span>
              <span className="text-primary font-mono font-bold">{config.numUsers}</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              <span className="text-slate-400">资源块:</span>
              <span className="text-primary font-mono font-bold">{config.numRBs}</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-400" />
              <span className="text-slate-400">时隙:</span>
              <span className="text-primary font-mono font-bold">{config.numSlots}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4">
        {compareResult ? (
          <ComparePanel />
        ) : (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-3">
              <ConfigPanel />
            </div>

            <div className="col-span-6 space-y-4">
              <RBGridView />
              <ControlPanel />
            </div>

            <div className="col-span-3">
              <StatisticsPanel />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
