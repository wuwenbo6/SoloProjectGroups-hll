import { useOTNStore } from "@/store/otnStore";
import { Layers, Zap, ArrowRightLeft, Settings, AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";
import type { ODUType, MappingType } from "@/types/otn";

const ODU_OPTIONS: { value: ODUType; label: string; desc: string }[] = [
  { value: "ODU2", label: "ODU2", desc: "10G (8 TS)" },
  { value: "ODU3", label: "ODU3", desc: "40G (32 TS)" },
];

export default function ControlPanel() {
  const selectedOduType = useOTNStore((s) => s.selectedOduType);
  const mappingType = useOTNStore((s) => s.mappingType);
  const loading = useOTNStore((s) => s.loading);
  const state = useOTNStore((s) => s.state);
  const { setOduType, setMappingType, setOverheadDrawerOpen, addODU0 } = useOTNStore();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Layers size={16} className="text-cyan-400" />
        <h3 className="text-sm font-semibold text-cyan-300 tracking-wider uppercase">控制面板</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">高阶ODU类型</label>
          <div className="flex gap-2">
            {ODU_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setOduType(opt.value)}
                disabled={loading}
                className={`flex-1 px-3 py-2 rounded-lg border text-xs transition-all duration-200 ${
                  selectedOduType === opt.value
                    ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-[0_0_12px_rgba(0,212,255,0.2)]"
                    : "bg-slate-800/30 border-slate-700/30 text-slate-400 hover:border-slate-600"
                }`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">映射方式</label>
          <div className="flex gap-2">
            {(["GMP", "AMP"] as MappingType[]).map((mt) => (
              <button
                key={mt}
                onClick={() => setMappingType(mt)}
                disabled={loading}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs transition-all duration-200 ${
                  mappingType === mt
                    ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-[0_0_12px_rgba(0,212,255,0.2)]"
                    : "bg-slate-800/30 border-slate-700/30 text-slate-400 hover:border-slate-600"
                }`}
              >
                <Zap size={12} />
                {mt}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-slate-600 mt-1">
            {mappingType === "GMP" ? "Generic Mapping Procedure - 通用映射 (Cm/CnD)" : "Asynchronous Mapping Procedure - 异步映射 (JC/NJO/PJO)"}
          </div>
        </div>

        <div className="border-t border-slate-700/30 pt-3 space-y-2">
          <label className="text-xs text-slate-400 block">快捷操作</label>

          <button
            onClick={() => addODU0(`ODU0-${(state?.odu0Signals.length || 0) + 1}`)}
            disabled={loading || (state ? state.timeslots.every((ts) => ts.occupied) : false)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all duration-200 bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-400/50 hover:shadow-[0_0_12px_rgba(0,212,255,0.15)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-cyan-500/10"
          >
            <ArrowRightLeft size={14} />
            添加ODU0信号并自动映射
          </button>

          <button
            onClick={() => setOverheadDrawerOpen(true)}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all duration-200 bg-slate-800/30 border-slate-700/30 text-slate-400 hover:bg-slate-700/30 hover:text-slate-300"
          >
            <Settings size={14} />
            编辑映射开销
          </button>
        </div>
      </div>

      {state && (
        <div className="border-t border-slate-700/30 pt-3">
          <div className="text-xs text-slate-500 mb-2">状态概览</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/30 rounded-lg p-2 text-center">
              <div className="text-lg font-mono font-bold text-cyan-400">
                {state.timeslots.filter((ts) => ts.occupied).length}
              </div>
              <div className="text-[10px] text-slate-500">已占用时隙</div>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-2 text-center">
              <div className="text-lg font-mono font-bold text-green-400">
                {state.timeslots.filter((ts) => !ts.occupied).length}
              </div>
              <div className="text-[10px] text-slate-500">空闲时隙</div>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-2 text-center">
              <div className="text-lg font-mono font-bold text-amber-400">
                {state.odu0Signals.length}
              </div>
              <div className="text-[10px] text-slate-500">客户信号</div>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-2 text-center">
              <div className="text-lg font-mono font-bold text-purple-400">
                {state.mappingType}
              </div>
              <div className="text-[10px] text-slate-500">映射方式</div>
            </div>
          </div>
          {state.alarms.filter((a) => a.active).length > 0 && (
            <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400 animate-pulse" />
              <div>
                <div className="text-xs font-semibold text-red-400">
                  {state.alarms.filter((a) => a.active).length} 个活跃告警
                </div>
                <div className="text-[10px] text-red-400/70">
                  {state.alarms.filter((a) => a.active).map((a) => `TS${a.tsIndex}:${a.alarmType}`).join(", ")}
                </div>
              </div>
            </div>
          )}
          {Object.keys(state.justification).length > 0 && (
            <div className="mt-2 bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-2">
              <div className="text-[10px] text-cyan-400/70 mb-1">JC调整状态</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(state.justification).map(([tsKey, just]) => (
                  <div key={tsKey} className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-800/50 border border-slate-700/30">
                    <span className="text-slate-400 font-mono">TS{tsKey}</span>
                    {just.justType === "negative" && <ArrowDown size={9} className="text-blue-400" />}
                    {just.justType === "positive" && <ArrowUp size={9} className="text-orange-400" />}
                    <span className={just.justType === "negative" ? "text-blue-400" : just.justType === "positive" ? "text-orange-400" : "text-slate-500"}>
                      {just.justType === "negative" ? "NJO" : just.justType === "positive" ? "PJO" : "--"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
