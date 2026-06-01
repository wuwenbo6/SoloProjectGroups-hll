import { useOTNStore } from "@/store/otnStore";
import { Trash2, Play, Plus, Radio, AlertTriangle, ShieldOff, ShieldCheck, Download, GitBranch, X, Sliders } from "lucide-react";
import type { JustificationInfo, ClientSignalType } from "@/types/otn";
import { useState } from "react";

const JUST_TYPE_LABEL: Record<string, { text: string; color: string }> = {
  negative: { text: "负调整 NJO", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  positive: { text: "正调整 PJO", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  none: { text: "无需调整", color: "text-slate-500 bg-slate-700/30 border-slate-700/20" },
};

export default function TimeslotPanel() {
  const state = useOTNStore((s) => s.state);
  const loading = useOTNStore((s) => s.loading);
  const { multiplex, demultiplex, addSignal, removeODU0, setSelectedTimeslot, simulateSignalLoss, clearAlarm, fetchMuxDiagram, setDiagramModalOpen, setOduType } = useOTNStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSignalName, setNewSignalName] = useState("");
  const [newSignalType, setNewSignalType] = useState<ClientSignalType>("ODU0");
  const [newTsCount, setNewTsCount] = useState(1);
  const [newBitrateGbps, setNewBitrateGbps] = useState<number | undefined>(undefined);

  if (!state) return null;

  const occupied = state.timeslots.filter((ts) => ts.occupied).length;
  const total = state.timeslots.length;
  const occupancyRate = (occupied / total) * 100;
  const activeAlarms = state.alarms.filter((a) => a.active);
  const freeCount = total - occupied;

  const handleAddSignal = () => {
    const name = newSignalName || (newSignalType === "ODU0" ? `ODU0-${state.odu0Signals.length + 1}` : `ODUflex-${state.odu0Signals.length + 1}`);
    const bitrate = newSignalType === "ODUflex" && newBitrateGbps ? newBitrateGbps : undefined;
    addSignal(name, newSignalType, newTsCount, bitrate);
    setShowAddModal(false);
    setNewSignalName("");
    setNewSignalType("ODU0");
    setNewTsCount(1);
    setNewBitrateGbps(undefined);
  };

  const handleExportDiagram = async (format: "svg" | "json") => {
    await fetchMuxDiagram(format);
    if (format === "svg") {
      setDiagramModalOpen(true);
    } else {
      const dataStr = JSON.stringify(state, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mux_diagram_${state.oduType}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-cyan-300 tracking-wider uppercase">时隙占用</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExportDiagram("svg")}
            disabled={loading}
            className="p-1.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-all disabled:opacity-30"
            title="导出复用结构图"
          >
            <GitBranch size={12} />
          </button>
          <span className="text-xs text-slate-400">{occupied}/{total}</span>
        </div>
      </div>

      <div className="w-full bg-slate-800/50 rounded-full h-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${occupancyRate}%`,
            background: occupancyRate > 80
              ? "linear-gradient(90deg, #FFB800, #FF4444)"
              : occupancyRate > 50
              ? "linear-gradient(90deg, #00D4FF, #FFB800)"
              : "linear-gradient(90deg, #00FF88, #00D4FF)",
          }}
        />
      </div>

      {activeAlarms.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-red-400 text-xs font-semibold">
            <AlertTriangle size={12} className="animate-pulse" />
            告警 ({activeAlarms.length})
          </div>
          {activeAlarms.map((alarm, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] bg-red-500/5 border border-red-500/20 rounded px-2 py-1">
              <div className="flex items-center gap-1.5">
                <ShieldOff size={10} className="text-red-400" />
                <span className="text-red-300 font-mono">TS{alarm.tsIndex}</span>
                <span className="text-red-400/80">{alarm.alarmType}</span>
                <span className="text-slate-500 truncate max-w-[80px]">{alarm.signalName}</span>
              </div>
              <button
                onClick={() => clearAlarm(alarm.tsIndex)}
                className="text-red-400/60 hover:text-green-400 transition-colors"
                title="清除告警"
              >
                <ShieldCheck size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {state.timeslots.filter((ts) => ts.isLead || !ts.occupied).map((ts) => {
          const tsList = ts.occupied && ts.tsCount > 1
            ? state.timeslots.filter(t => t.odu0Id === ts.odu0Id)
            : [ts];
          const tsIndices = tsList.map(t => t.index).sort((a, b) => a - b);
          const tsRange = tsIndices.length > 1 ? `${tsIndices[0]}-${tsIndices[tsIndices.length - 1]}` : tsIndices[0];
          const actualTs = tsList[0];
          const just: JustificationInfo | undefined = state.justification[String(actualTs.index)];
          const justLabel = just ? JUST_TYPE_LABEL[just.justType] : null;
          const hasLck = tsList.some(t => t.lck);

          return (
            <div
              key={ts.index}
              className={`relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 cursor-pointer group ${
                hasLck
                  ? "bg-red-500/10 border-red-500/40 hover:border-red-400/60"
                  : actualTs.occupied
                  ? "bg-amber-500/10 border-amber-500/30 hover:border-amber-400/60 hover:bg-amber-500/15"
                  : "bg-[#0A2A4A]/50 border-slate-700/30 hover:border-cyan-500/40 hover:bg-cyan-500/5"
              }`}
              onClick={() => setSelectedTimeslot(actualTs.index)}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  hasLck
                    ? "bg-red-500 shadow-[0_0_6px_rgba(255,68,68,0.6)] animate-pulse"
                    : actualTs.occupied
                    ? "bg-amber-400 shadow-[0_0_6px_rgba(255,184,0,0.6)]"
                    : "bg-slate-600"
                }`}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-semibold ${hasLck ? "text-red-400" : actualTs.occupied ? "text-amber-300" : "text-slate-500"}`}>
                    TS{tsRange}
                  </span>
                  {actualTs.occupied && actualTs.signalType === "ODUflex" && (
                    <span className="text-[9px] px-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      flex ×{actualTs.tsCount}
                    </span>
                  )}
                  {!actualTs.occupied && (
                    <span className="text-[10px] text-slate-500">1.25G</span>
                  )}
                  {hasLck && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-semibold animate-pulse">
                      LCK
                    </span>
                  )}
                </div>
                {actualTs.occupied && !hasLck && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-amber-400/80 font-mono truncate">
                      {actualTs.odu0Id}
                    </span>
                    <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {actualTs.mappingType}
                    </span>
                  </div>
                )}
                {just && actualTs.occupied && !hasLck && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`text-[9px] px-1 py-0.5 rounded border ${justLabel?.color || ""}`}>
                      {justLabel?.text || "无调整"}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">
                      Δ{just.deltaRateKbps.toFixed(0)}kbps
                    </span>
                  </div>
                )}
              </div>

              {actualTs.occupied && !hasLck && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      simulateSignalLoss(actualTs.index);
                    }}
                    disabled={loading}
                    className="p-1 rounded hover:bg-orange-500/20 text-orange-400/60 hover:text-orange-400 transition-all"
                    title="模拟信号丢失 (LCK)"
                  >
                    <ShieldOff size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      demultiplex(actualTs.index);
                    }}
                    disabled={loading}
                    className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all"
                    title="解复用"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(state.justification).length > 0 && (
        <div className="border-t border-slate-700/30 pt-3">
          <h4 className="text-xs font-semibold text-slate-400 mb-2">JC调整详情</h4>
          <div className="space-y-2">
            {Object.entries(state.justification).map(([tsKey, just]) => (
              <div key={tsKey} className="bg-slate-800/30 rounded-lg p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-300">TS{tsKey}</span>
                  <span className={`text-[9px] px-1 py-0.5 rounded border ${JUST_TYPE_LABEL[just.justType]?.color || ""}`}>
                    {JUST_TYPE_LABEL[just.justType]?.text || just.justType}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] font-mono">
                  <div className="text-slate-500">客户端: <span className="text-slate-300">{(just.clientRateKbps / 1e6).toFixed(3)} Gbps</span></div>
                  <div className="text-slate-500">服务端: <span className="text-slate-300">{(just.serverTsRateKbps / 1e6).toFixed(3)} Gbps</span></div>
                  <div className="text-slate-500">Cm: <span className="text-cyan-400">{just.cm}</span></div>
                  <div className="text-slate-500">CnD: <span className="text-cyan-400">{just.cnd}</span></div>
                  <div className="text-slate-500">NJO: <span className={just.njo > 0 ? "text-blue-400" : "text-slate-600"}>{just.njo}</span></div>
                  <div className="text-slate-500">PJO: <span className={just.pjo > 0 ? "text-orange-400" : "text-slate-600"}>{just.pjo}</span></div>
                  <div className="col-span-2 text-slate-500">
                    JC: <span className="text-slate-300">
                      {just.jc.map(v => v.toString(16).padStart(2, "0").toUpperCase()).join(" ")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-slate-700/30 pt-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-400">客户信号列表</h4>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={loading || freeCount === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus size={12} />
            添加
          </button>
        </div>

        {state.odu0Signals.length === 0 ? (
          <div className="text-xs text-slate-600 text-center py-3 border border-dashed border-slate-700/30 rounded-lg">
            暂无客户信号
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {state.odu0Signals.map((sig) => {
              const isMapped = state.timeslots.some((ts) => ts.odu0Id === sig.id);
              const hasLck = state.timeslots.some((ts) => ts.odu0Id === sig.id && ts.lck);
              const leadTs = state.timeslots.find((ts) => ts.odu0Id === sig.id && ts.isLead);
              const canMultiplex = !isMapped && freeCount >= sig.tsCount;
              return (
                <div
                  key={sig.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-all ${
                    hasLck
                      ? "bg-red-500/5 border-red-500/20"
                      : isMapped
                      ? "bg-green-500/5 border-green-500/20"
                      : "bg-slate-800/30 border-slate-700/20"
                  }`}
                >
                  <Radio size={12} className={hasLck ? "text-red-400 animate-pulse" : isMapped ? "text-green-400" : "text-slate-500"} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono text-slate-300 truncate">{sig.name}</span>
                      {sig.signalType === "ODUflex" && (
                        <span className="text-[9px] px-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          flex
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <span>{sig.bitrateGbps.toFixed(3)} Gbps</span>
                      <span>×{sig.tsCount} TS</span>
                    </div>
                  </div>

                  {canMultiplex && (
                    <button
                      onClick={() => multiplex(sig.id)}
                      disabled={loading}
                      className="p-1 rounded hover:bg-cyan-500/20 text-cyan-400 transition-all"
                      title="复用到空闲时隙"
                    >
                      <Play size={12} />
                    </button>
                  )}

                  {!isMapped && (
                    <button
                      onClick={() => removeODU0(sig.id)}
                      disabled={loading}
                      className="p-1 rounded hover:bg-red-500/20 text-red-400/60 hover:text-red-400 transition-all"
                      title="删除信号"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}

                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    hasLck
                      ? "bg-red-500/10 text-red-400 border border-red-500/20"
                      : isMapped
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : "bg-slate-700/30 text-slate-500 border border-slate-700/20"
                  }`}>
                    {hasLck ? "LCK" : isMapped ? "已映射" : "未映射"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#0A1628] border border-slate-700/50 rounded-xl p-4 w-80 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-cyan-300">添加客户信号</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-slate-300">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">信号类型</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setNewSignalType("ODU0"); setNewTsCount(1); }}
                    className={`flex-1 py-2 rounded text-xs border transition-all ${
                      newSignalType === "ODU0"
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                        : "bg-slate-800/30 text-slate-400 border-slate-700/30 hover:border-slate-600"
                    }`}
                  >
                    ODU0
                    <div className="text-[9px] opacity-70">1.25G × 1TS</div>
                  </button>
                  <button
                    onClick={() => { setNewSignalType("ODUflex"); setNewTsCount(2); }}
                    className={`flex-1 py-2 rounded text-xs border transition-all ${
                      newSignalType === "ODUflex"
                        ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                        : "bg-slate-800/30 text-slate-400 border-slate-700/30 hover:border-slate-600"
                    }`}
                  >
                    ODUflex
                    <div className="text-[9px] opacity-70">可变带宽</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">信号名称</label>
                <input
                  type="text"
                  value={newSignalName}
                  onChange={(e) => setNewSignalName(e.target.value)}
                  placeholder={newSignalType === "ODU0" ? "ODU0-1" : "ODUflex-1"}
                  className="w-full px-2 py-1.5 rounded bg-slate-900/50 border border-slate-700/30 text-xs text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">
                  时隙数量: {newTsCount} TS ({(newTsCount * 1.24416).toFixed(3)} Gbps)
                </label>
                <input
                  type="range"
                  min={1}
                  max={freeCount}
                  value={newTsCount}
                  onChange={(e) => setNewTsCount(parseInt(e.target.value))}
                  disabled={newSignalType === "ODU0"}
                  className="w-full accent-cyan-500 disabled:opacity-30"
                />
              </div>

              {newSignalType === "ODUflex" && (
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    自定义带宽 (Gbps，可选)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.1"
                    value={newBitrateGbps ?? ""}
                    onChange={(e) => setNewBitrateGbps(e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder={`默认: ${(newTsCount * 1.24416).toFixed(3)}`}
                    className="w-full px-2 py-1.5 rounded bg-slate-900/50 border border-slate-700/30 text-xs text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                  />
                </div>
              )}

              <button
                onClick={handleAddSignal}
                disabled={loading || newTsCount > freeCount}
                className="w-full py-2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-all text-xs font-semibold disabled:opacity-30"
              >
                创建信号
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
