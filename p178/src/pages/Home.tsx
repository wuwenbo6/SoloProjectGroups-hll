import { useState, useCallback } from 'react';
import { useBusStore } from '../store/busStore';
import { runFullSimulation } from '../engine/busEngine';
import NodePanel from '../components/NodePanel';
import Oscilloscope from '../components/Oscilloscope';
import StatusLog from '../components/StatusLog';
import ArbitrationResult from '../components/ArbitrationResult';
import BusStats from '../components/BusStats';
import { Activity, Cpu, Zap, Clock, FileCode } from 'lucide-react';

export default function Home() {
  const {
    nodes,
    selectedNodeIds,
    waveform,
    logs,
    winnerNodeId,
    loserNodeIds,
    isSimulating,
    totalRounds,
    statistics,
    successfulModbusFrames,
    useModbus,
    setSimulationResult,
    setSimulating,
    resetSimulation,
    clearLogs,
  } = useBusStore();

  const [hasSimulation, setHasSimulation] = useState(false);

  const handleStartSimulation = useCallback(() => {
    if (selectedNodeIds.length === 0) return;

    setSimulating(true);
    clearLogs();

    setTimeout(() => {
      const result = runFullSimulation(nodes, selectedNodeIds, 5, useModbus);

      setSimulationResult(
        result.waveform,
        result.logs,
        result.winnerNodeId,
        result.loserNodeIds,
        result.nodeBackoffCounts,
        result.nodeBackoffDelays,
        result.totalRounds,
        result.statistics,
        result.successfulModbusFrames
      );
      setHasSimulation(true);
    }, 300);
  }, [nodes, selectedNodeIds, useModbus, setSimulating, setSimulationResult, clearLogs]);

  const handleReset = useCallback(() => {
    resetSimulation();
    setHasSimulation(false);
  }, [resetSimulation]);

  const handleClearLogs = useCallback(() => {
    clearLogs();
  }, [clearLogs]);

  return (
    <div className="min-h-screen bg-[#0a0e17] text-[#e0e6ed]">
      <header className="border-b border-[#1a2332] bg-[#0f1623]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#00d4ff]/10">
                <Activity className="text-[#00d4ff]" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#e0e6ed]">RS-485 总线模拟器</h1>
                <p className="text-xs text-[#667788]">
                  多节点冲突检测与地址优先级仲裁
                  {useModbus && <span className="text-[#8b5cf6] ml-2">| Modbus RTU</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-[#667788]">
                <Cpu size={14} />
                <span>{nodes.length} 个节点</span>
              </div>
              {totalRounds > 0 && (
                <div className="flex items-center gap-2 text-xs text-[#8b5cf6]">
                  <Clock size={14} />
                  <span>{totalRounds} 轮仲裁</span>
                </div>
              )}
              {successfulModbusFrames.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-[#10b981]">
                  <FileCode size={14} />
                  <span>{successfulModbusFrames.length} 帧成功</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-[#667788]">
                <Zap size={14} className={isSimulating ? 'text-[#f59e0b] animate-pulse' : ''} />
                <span>{isSimulating ? '模拟中' : '就绪'}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3">
            <div className="bg-[#0f1623] rounded-xl p-4 border border-[#1a2332]">
              <NodePanel onStartSimulation={handleStartSimulation} />
            </div>
          </div>

          <div className="col-span-6">
            <div className="bg-[#0f1623] rounded-xl p-4 border border-[#1a2332] mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#00d4ff]">总线示波器</h2>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-[#ffffff]"></div>
                    <span className="text-[#8899aa]">总线</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-[#ef4444]"></div>
                    <span className="text-[#8899aa]">冲突</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-[#10b981]"></div>
                    <span className="text-[#8899aa]">获胜</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 border-t border-dashed border-[#f59e0b]"></div>
                    <span className="text-[#8899aa]">丢失</span>
                  </div>
                </div>
              </div>
              <Oscilloscope
                nodes={nodes}
                waveform={waveform}
                winnerNodeId={winnerNodeId}
                loserNodeIds={loserNodeIds}
              />
            </div>

            <div className="bg-[#0f1623] rounded-xl p-4 border border-[#1a2332]">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-2 rounded-lg bg-[#1a2332]">
                  <span className="text-xs text-[#667788]">协议规则</span>
                </div>
                <div className="text-xs text-[#8899aa] space-y-1">
                  <p><span className="text-[#00d4ff]">总线电平:</span> 显性(0)优先于隐性(1)，任何节点发送0则总线为0</p>
                  <p><span className="text-[#00d4ff]">仲裁机制:</span> 地址位逐位比较，发送1但总线为0的节点丢失仲裁</p>
                  <p><span className="text-[#00d4ff]">优先级:</span> 地址值越小优先级越高</p>
                  <p><span className="text-[#8b5cf6]">退避机制:</span> 冲突后丢失节点指数退避，等待随机时隙后重试</p>
                  {useModbus && (
                    <p><span className="text-[#8b5cf6]">Modbus RTU:</span> 从机地址 + 功能码 + 数据 + CRC16 校验</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-3 space-y-6">
            <div className="bg-[#0f1623] rounded-xl p-4 border border-[#1a2332]">
              <ArbitrationResult
                nodes={nodes}
                winnerNodeId={winnerNodeId}
                loserNodeIds={loserNodeIds}
                hasSimulation={hasSimulation}
              />
            </div>

            <div className="bg-[#0f1623] rounded-xl p-4 border border-[#1a2332]">
              <BusStats statistics={statistics} />
            </div>

            <div className="bg-[#0f1623] rounded-xl p-4 border border-[#1a2332]">
              <StatusLog logs={logs} onClear={handleClearLogs} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
