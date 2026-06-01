import { Radio, Settings, Play, Pause, RotateCcw, Wifi, WifiOff, Download, Users, Plus, X } from "lucide-react";
import { useSimulatorStore, useWebSocket } from "@/store/useSimulatorStore";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import type { TPMode } from "@/types";

export function ControlPanel() {
  const {
    config,
    mode,
    connected,
    running,
    state,
    setConfig,
    setMode,
    reset,
    updateReceiverNode,
    addReceiverNode,
    removeReceiverNode,
  } = useSimulatorStore();
  const { send } = useWebSocket(true);
  const wsRef = useRef<ReturnType<typeof useWebSocket> | null>(null);
  const [pcapFrameCount, setPcapFrameCount] = useState(0);

  useEffect(() => {
    wsRef.current = { connect: () => () => {}, disconnect: () => {}, send };
  }, [send]);

  useEffect(() => {
    if (running) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch("http://localhost:8000/api/pcap/info");
          const data = await res.json();
          setPcapFrameCount(data.frame_count);
        } catch (e) {}
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setPcapFrameCount(0);
    }
  }, [running]);

  const handleExportPcap = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/pcap");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `j1939_tp_${Date.now()}.pcap`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PCAP导出失败:", e);
    }
  };

  const handleModeChange = (newMode: TPMode) => {
    if (running) return;
    setMode(newMode);
  };

  const handleConfigChange = (key: keyof typeof config, value: number) => {
    if (running) return;
    setConfig({ [key]: value });
  };

  const handleStart = () => {
    send({ type: "update_config", payload: config });
    setTimeout(() => {
      send({ type: "start_simulation" });
    }, 100);
  };

  const handleStop = () => {
    send({ type: "stop_simulation" });
  };

  const handleReset = () => {
    send({ type: "reset_simulation" });
    reset();
  };

  const statusColor = {
    idle: "bg-zinc-500",
    waiting_cts: "bg-yellow-500",
    transmitting: "bg-cyan-500",
    retransmitting: "bg-orange-500",
    waiting_ack: "bg-yellow-500",
    complete: "bg-emerald-500",
    aborted: "bg-red-500",
  }[state];

  const statusText = {
    idle: "空闲",
    waiting_cts: "等待CTS",
    transmitting: "传输中",
    retransmitting: "重传中",
    waiting_ack: "等待确认",
    complete: "已完成",
    aborted: "已中止",
  }[state];

  return (
    <div className="w-96 bg-zinc-900/80 backdrop-blur border-r border-zinc-800 flex flex-col h-full">
      <div className="p-5 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            J1939 TP 模拟器
          </h1>
          <div className={cn("w-3 h-3 rounded-full", connected ? "bg-emerald-500" : "bg-red-500")} />
        </div>
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{connected ? "WebSocket 已连接" : "未连接"}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Radio size={14} />
            传输模式
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleModeChange("bam")}
              disabled={running}
              className={cn(
                "p-3 rounded-lg border-2 transition-all duration-300 text-left",
                mode === "bam"
                  ? "border-cyan-500 bg-cyan-500/10 shadow-[0_0_20px_rgba(0,212,255,0.3)]"
                  : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600",
                running && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="text-sm font-bold text-cyan-400">BAM</div>
              <div className="text-[10px] text-zinc-400 mt-1">单节点广播</div>
            </button>
            <button
              onClick={() => handleModeChange("multi_node_bam")}
              disabled={running}
              className={cn(
                "p-3 rounded-lg border-2 transition-all duration-300 text-left",
                mode === "multi_node_bam"
                  ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600",
                running && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="text-sm font-bold text-emerald-400">多节点</div>
              <div className="text-[10px] text-zinc-400 mt-1">多接收节点</div>
            </button>
            <button
              onClick={() => handleModeChange("cmdt")}
              disabled={running}
              className={cn(
                "p-3 rounded-lg border-2 transition-all duration-300 text-left",
                mode === "cmdt"
                  ? "border-purple-500 bg-purple-500/10 shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                  : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600",
                running && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="text-sm font-bold text-purple-400">CMDT</div>
              <div className="text-[10px] text-zinc-400 mt-1">点对点</div>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Settings size={14} />
            参数配置
          </h3>
          <div className="space-y-4 bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                消息大小: <span className="text-cyan-400 font-mono">{config.messageSize}</span> 字节
              </label>
              <input
                type="range"
                min={9}
                max={1785}
                value={config.messageSize}
                onChange={(e) => handleConfigChange("messageSize", Number(e.target.value))}
                disabled={running}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                <span>9</span>
                <span>1785</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">源地址 (SA)</label>
                <input
                  type="number"
                  min={0}
                  max={253}
                  value={config.sourceAddress}
                  onChange={(e) => handleConfigChange("sourceAddress", Number(e.target.value))}
                  disabled={running}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm font-mono text-cyan-400 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">目标地址 (DA)</label>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={mode === "bam" ? 255 : config.destinationAddress}
                  onChange={(e) => handleConfigChange("destinationAddress", Number(e.target.value))}
                  disabled={running || mode === "bam"}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm font-mono text-cyan-400 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                丢包率: <span className="text-red-400 font-mono">{(config.packetLossRate * 100).toFixed(0)}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={config.packetLossRate}
                onChange={(e) => handleConfigChange("packetLossRate", Number(e.target.value))}
                disabled={running}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-500 disabled:opacity-50"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                帧间隔: <span className="text-yellow-400 font-mono">{config.frameInterval}</span> ms
              </label>
              <input
                type="range"
                min={10}
                max={500}
                step={10}
                value={config.frameInterval}
                onChange={(e) => handleConfigChange("frameInterval", Number(e.target.value))}
                disabled={running}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-yellow-500 disabled:opacity-50"
              />
            </div>

            {mode === "bam" && (
              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  乱序率: <span className="text-orange-400 font-mono">{(config.outOfOrderRate * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={config.outOfOrderRate}
                  onChange={(e) => handleConfigChange("outOfOrderRate", Number(e.target.value))}
                  disabled={running}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500 disabled:opacity-50"
                />
                <div className="text-[10px] text-zinc-500 mt-1">
                  模拟乱序接收，测试序列号校验
                </div>
              </div>
            )}

            {mode === "cmdt" && (
              <>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    CTS窗口大小: <span className="text-purple-400 font-mono">{config.ctsWindowSize}</span> 帧
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={255}
                    value={config.ctsWindowSize}
                    onChange={(e) => handleConfigChange("ctsWindowSize", Number(e.target.value))}
                    disabled={running}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    CTS超时: <span className="text-purple-400 font-mono">{config.ctsTimeout}</span> 秒
                  </label>
                  <input
                    type="range"
                    min={0.5}
                    max={5}
                    step={0.5}
                    value={config.ctsTimeout}
                    onChange={(e) => handleConfigChange("ctsTimeout", Number(e.target.value))}
                    disabled={running}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    CTS丢包率: <span className="text-pink-400 font-mono">{(config.ctsLossRate * 100).toFixed(0)}%</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.ctsLossRate}
                    onChange={(e) => handleConfigChange("ctsLossRate", Number(e.target.value))}
                    disabled={running}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500 disabled:opacity-50"
                  />
                  <div className="text-[10px] text-zinc-500 mt-1">
                    模拟CTS丢失，测试RTS超时重试
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    RTS最大重试: <span className="text-purple-400 font-mono">{config.maxRtsRetries}</span> 次
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    value={config.maxRtsRetries}
                    onChange={(e) => handleConfigChange("maxRtsRetries", Number(e.target.value))}
                    disabled={running}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50"
                  />
                </div>
              </>
            )}

            {mode === "multi_node_bam" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-400 flex items-center gap-1">
                    <Users size={12} />
                    接收节点配置
                  </label>
                  <button
                    onClick={addReceiverNode}
                    disabled={running || config.receiverNodes.length >= 8}
                    className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded text-xs transition-all"
                  >
                    <Plus size={12} />
                    添加
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {config.receiverNodes.map((node) => (
                    <div
                      key={node.node_id}
                      className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-700/50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
                            {node.name.charAt(node.name.length - 1)}
                          </div>
                          <span className="text-sm font-semibold text-zinc-300">{node.name}</span>
                          <span className="text-xs text-zinc-500 font-mono">0x{node.address.toString(16).toUpperCase().padStart(2, "0")}</span>
                        </div>
                        <button
                          onClick={() => removeReceiverNode(node.node_id)}
                          disabled={running || config.receiverNodes.length <= 1}
                          className="p-1 hover:bg-red-500/20 disabled:opacity-30 rounded transition-all"
                        >
                          <X size={14} className="text-red-400" />
                        </button>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-zinc-500 block mb-1">
                            丢包率: <span className="text-red-400 font-mono">{(node.packet_loss_rate * 100).toFixed(0)}%</span>
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={node.packet_loss_rate}
                            onChange={(e) => updateReceiverNode(node.node_id, { packet_loss_rate: Number(e.target.value) })}
                            disabled={running}
                            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-500 disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500 block mb-1">
                            乱序率: <span className="text-orange-400 font-mono">{(node.out_of_order_rate * 100).toFixed(0)}%</span>
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={node.out_of_order_rate}
                            onChange={(e) => updateReceiverNode(node.node_id, { out_of_order_rate: Number(e.target.value) })}
                            disabled={running}
                            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500 disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
            <div className={cn("w-3 h-3 rounded-full animate-pulse", statusColor)} />
            <span className="text-sm text-zinc-300">状态:</span>
            <span className={cn("text-sm font-semibold", statusColor.replace("bg-", "text-"))}>
              {statusText}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!running ? (
              <button
                onClick={handleStart}
                disabled={!connected}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-semibold transition-all duration-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]"
              >
                <Play size={18} />
                开始
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition-all duration-300 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
              >
                <Pause size={18} />
                停止
              </button>
            )}
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-2 py-3 px-4 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-semibold transition-all duration-300"
            >
              <RotateCcw size={18} />
              重置
            </button>
          </div>

          <button
            onClick={handleExportPcap}
            disabled={running}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg font-semibold transition-all duration-300 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]"
          >
            <Download size={18} />
            导出 PCAP {pcapFrameCount > 0 && `(${pcapFrameCount} 帧)`}
          </button>
        </div>
      </div>
    </div>
  );
}
