import React, { useMemo } from 'react';
import type { TimingAnalysisResult } from '@shared/types';
import { useLLVMStore } from '../store/useLLVMStore';

const TimingViewer: React.FC = () => {
  const compileResult = useLLVMStore(state => state.compileResult);
  const timing = compileResult?.timing;

  const scheduleData = useMemo(() => {
    if (!timing) return null;

    const maxCycle = timing.latency;
    const cycles = Array.from({ length: maxCycle + 1 }, (_, i) => i);
    
    const instructionsByCycle = cycles.map(cycle => 
      timing.nodes.filter(
        n => n.type === 'instruction' && 
        n.asapCycle <= cycle && 
        n.alapCycle >= cycle
      )
    );

    return { cycles, instructionsByCycle, maxCycle };
  }, [timing]);

  if (!timing) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <p className="text-4xl mb-4">⏱️</p>
          <p className="text-lg">编译代码以查看时序分析</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-200 overflow-auto p-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4 text-emerald-400">⏱️ 时序分析报告</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="总指令数" value={timing.totalInstructions} icon="📝" />
          <StatCard label="关键路径长度" value={`${timing.criticalPathLength} cycles`} icon="🔴" />
          <StatCard label="延迟 (Latency)" value={`${timing.latency} cycles`} icon="⏳" />
          <StatCard label="吞吐量" value={`${timing.throughput.toFixed(4)} ops/cycle`} icon="⚡" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4 text-amber-400">🔴 关键路径</h3>
          <div className="space-y-2 max-h-80 overflow-auto">
            {timing.criticalPath.map((nodeId, idx) => {
              const node = timing.nodes.find(n => n.id === nodeId);
              if (!node) return null;
              return (
                <div key={nodeId} className="flex items-center gap-3 p-2 bg-red-900/30 rounded border border-red-500/50">
                  <span className="text-red-400 font-mono text-sm">C{node.asapCycle}</span>
                  <span className="text-emerald-400 font-mono text-sm">%{node.valueName}</span>
                  <span className="text-slate-400 text-sm truncate flex-1">
                    {node.instruction.slice(0, 60)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4 text-blue-400">📊 指令调度表</h3>
          <div className="space-y-2 max-h-80 overflow-auto">
            {Array.from(timing.nodes)
              .filter(n => n.type === 'instruction')
              .sort((a, b) => a.asapCycle - b.asapCycle)
              .map(node => (
                <div 
                  key={node.id} 
                  className={`flex items-center gap-3 p-2 rounded border ${
                    node.criticalPath 
                      ? 'bg-red-900/30 border-red-500/50' 
                      : 'bg-slate-700/50 border-slate-600'
                  }`}
                >
                  <div className="flex gap-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                      node.criticalPath ? 'bg-red-600' : 'bg-blue-600'
                    }`}>
                      {node.asapCycle}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-600">
                      {node.alapCycle}
                    </span>
                  </div>
                  <span className={`text-xs font-mono ${
                    node.criticalPath ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    slack: {node.slack}
                  </span>
                  <span className="text-emerald-400 font-mono text-sm">%{node.valueName}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4 text-purple-400">📈 流水线调度可视化</h3>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="flex border-b border-slate-600 mb-2">
                <div className="w-32 flex-shrink-0 text-sm text-slate-400 px-2">指令</div>
                {scheduleData?.cycles.map(cycle => (
                  <div 
                    key={cycle} 
                    className="w-10 flex-shrink-0 text-center text-xs text-slate-400 border-r border-slate-700"
                  >
                    {cycle}
                  </div>
                ))}
              </div>
              {Array.from(timing.nodes)
                .filter(n => n.type === 'instruction')
                .sort((a, b) => a.asapCycle - b.asapCycle)
                .map(node => (
                  <div key={node.id} className="flex items-center mb-1">
                    <div className="w-32 flex-shrink-0 text-sm truncate px-2">
                      <span className={node.criticalPath ? 'text-red-400' : 'text-slate-300'}>
                        %{node.valueName}
                      </span>
                    </div>
                    <div className="flex-1 flex relative h-6">
                      <div 
                        className={`absolute h-5 top-0.5 rounded ${
                          node.criticalPath ? 'bg-red-500' : 'bg-blue-500'
                        }`}
                        style={{
                          left: `${(node.asapCycle / (timing.latency || 1)) * 100}%`,
                          width: `${Math.max(((node.alapCycle - node.asapCycle + 1) / (timing.latency || 1)) * 100, 2)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string | number; icon: string }> = ({ label, value, icon }) => (
  <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xl">{icon}</span>
      <span className="text-sm text-slate-400">{label}</span>
    </div>
    <p className="text-2xl font-bold text-white">{value}</p>
  </div>
);

export default TimingViewer;
