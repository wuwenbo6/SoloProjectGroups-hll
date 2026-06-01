import React, { useEffect } from 'react';
import { Cpu, Activity } from 'lucide-react';
import { useSimStore } from './store/useSimStore';
import { NodeCard } from './components/NodeCard';
import { ControlPanel } from './components/ControlPanel';
import { BusTimeline } from './components/BusTimeline';
import { LogPanel } from './components/LogPanel';

function App() {
  const init = useSimStore((s) => s.init);
  const nodeConfigs = useSimStore((s) => s.nodeConfigs);
  const nodeStates = useSimStore((s) => s.nodeStates);
  const busState = useSimStore((s) => s.busState);
  const busConfig = useSimStore((s) => s.busConfig);
  const currentTime = useSimStore((s) => s.currentTime);
  const startTime = useSimStore((s) => s.startTime);

  useEffect(() => {
    init();
  }, [init]);

  const nodeIds = Object.keys(nodeConfigs);

  const totalSends = Object.values(nodeStates).reduce((sum, n) => sum + n.sendCount, 0);
  const totalConflicts = Object.values(nodeStates).reduce((sum, n) => sum + n.conflictCount, 0);
  const avgDelay =
    totalSends > 0
      ? Object.values(nodeStates).reduce((sum, n) => sum + n.totalDelays, 0) / totalSends
      : 0;

  const runTime = startTime ? currentTime - startTime : 0;
  const formatRuntime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const modeLabel = busConfig.mode === 'csma' ? 'CSMA/CD' : 'Modbus RTU';
  const modeColor = busConfig.mode === 'csma' ? 'text-blue-400' : 'text-purple-400';

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${busConfig.mode === 'csma' ? 'from-blue-500 to-purple-600' : 'from-purple-500 to-pink-600'} flex items-center justify-center shadow-lg ${busConfig.mode === 'csma' ? 'shadow-blue-500/20' : 'shadow-purple-500/20'}`}>
            <Cpu size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">RS-485 总线模拟器</h1>
            <p className="text-xs text-slate-400">
              {busConfig.mode === 'csma' ? '多节点通信仲裁与冲突检测' : 'Modbus RTU 主从通信模拟'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm">
            <Activity
              size={16}
              className={busState.isRunning ? 'text-green-400 animate-pulse' : 'text-slate-500'}
            />
            <span className="text-slate-400">运行时间:</span>
            <span className="font-mono text-slate-200">{formatRuntime(runTime)}</span>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-xs text-slate-500">模式</p>
              <p className={`font-mono text-sm font-semibold ${modeColor}`}>{modeLabel}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">节点数</p>
              <p className="font-mono text-lg text-blue-400 font-semibold">{nodeIds.length}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">发送成功</p>
              <p className="font-mono text-lg text-green-400 font-semibold">{totalSends}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">冲突次数</p>
              <p className="font-mono text-lg text-red-400 font-semibold">{totalConflicts}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500">平均延时</p>
              <p className="font-mono text-lg text-cyan-400 font-semibold">
                {avgDelay.toFixed(1)}
                <span className="text-xs ml-1">ms</span>
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-4">
        <div className="h-full grid grid-cols-12 gap-4">
          <div className="col-span-3 flex flex-col gap-4 overflow-hidden">
            <div className="flex-1 overflow-y-auto scrollbar-thin pr-2">
              <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${busConfig.mode === 'csma' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                {busConfig.mode === 'csma' ? '节点列表' : '主从节点'}
              </h2>
              <div className="flex flex-col gap-3">
                {nodeIds.map((nodeId) => (
                  <NodeCard
                    key={nodeId}
                    config={nodeConfigs[nodeId]}
                    state={nodeStates[nodeId]}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-9 flex flex-col gap-4 overflow-hidden">
            <div className="grid grid-cols-5 gap-4">
              <div className="col-span-2">
                <ControlPanel />
              </div>
              <div className="col-span-3 h-[340px]">
                <BusTimeline />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <LogPanel />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
