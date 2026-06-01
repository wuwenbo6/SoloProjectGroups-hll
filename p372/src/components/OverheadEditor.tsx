import { useOTNStore } from "@/store/otnStore";
import { X, Save, AlertCircle } from "lucide-react";
import { useState } from "react";
import type { ODUOverhead, PMOverhead, TCMOverhead, OPUkOverhead } from "@/types/otn";

export default function OverheadEditor() {
  const open = useOTNStore((s) => s.overheadDrawerOpen);
  const state = useOTNStore((s) => s.state);
  const loading = useOTNStore((s) => s.loading);
  const { setOverheadDrawerOpen, updateOverhead } = useOTNStore();
  const [localOverhead, setLocalOverhead] = useState<ODUOverhead | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"pm" | "tcm" | "opuk" | "other">("pm");

  if (!open || !state) return null;

  const overhead = localOverhead || state.overhead;

  const updatePM = (field: keyof PMOverhead, value: any) => {
    const newOh = { ...overhead, pm: { ...overhead.pm, [field]: value } };
    setLocalOverhead(newOh);
  };

  const updateTCM = (level: number, field: keyof TCMOverhead, value: any) => {
    const newTcm = overhead.tcm.map((t, i) =>
      i === level ? { ...t, [field]: value } : t
    );
    setLocalOverhead({ ...overhead, tcm: newTcm });
  };

  const updateOPUk = (field: keyof OPUkOverhead, value: any) => {
    setLocalOverhead({ ...overhead, opuk: { ...overhead.opuk, [field]: value } });
  };

  const handleSave = async () => {
    setErrors([]);
    try {
      await updateOverhead(overhead);
      setLocalOverhead(null);
      setOverheadDrawerOpen(false);
    } catch (e: any) {
      setErrors([e.message]);
    }
  };

  const handleCancel = () => {
    setLocalOverhead(null);
    setErrors([]);
    setOverheadDrawerOpen(false);
  };

  const tabs = [
    { key: "pm" as const, label: "PM" },
    { key: "tcm" as const, label: "TCM" },
    { key: "opuk" as const, label: "OPUk" },
    { key: "other" as const, label: "其他" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />
      <div className="relative ml-auto w-[420px] h-full bg-[#0A1628] border-l border-slate-700/50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700/30">
          <h3 className="text-sm font-semibold text-cyan-300 tracking-wider uppercase">映射开销编辑</h3>
          <button onClick={handleCancel} className="p-1.5 rounded-lg hover:bg-slate-700/30 text-slate-400 hover:text-slate-200 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-slate-700/30">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-all ${
                activeTab === tab.key
                  ? "text-cyan-300 border-b-2 border-cyan-400 bg-cyan-500/5"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {errors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle size={14} />
                <span className="font-semibold">校验错误</span>
              </div>
              {errors.map((e, i) => (
                <div key={i} className="text-red-400/80 text-xs mt-1">{e}</div>
              ))}
            </div>
          )}

          {activeTab === "pm" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Trail Trace Identifier (TTI)</label>
                <div className="flex flex-wrap gap-1">
                  {overhead.pm.tti.slice(0, 16).map((v, i) => (
                    <input
                      key={i}
                      type="text"
                      value={v.toString(16).padStart(2, "0").toUpperCase()}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 16);
                        if (!isNaN(val) && val >= 0 && val <= 255) {
                          const newTti = [...overhead.pm.tti];
                          newTti[i] = val;
                          updatePM("tti", newTti);
                        }
                      }}
                      className="w-9 h-7 text-center text-[10px] font-mono bg-slate-800/50 border border-slate-700/30 rounded text-slate-300 focus:border-cyan-500/50 focus:outline-none"
                      maxLength={2}
                    />
                  ))}
                  <span className="text-[9px] text-slate-600 self-center">... (64 bytes)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={overhead.pm.bdi}
                    onChange={(e) => updatePM("bdi", e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30"
                  />
                  BDI
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={overhead.pm.tim}
                    onChange={(e) => updatePM("tim", e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30"
                  />
                  TIM
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={overhead.pm.biae}
                    onChange={(e) => updatePM("biae", e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/30"
                  />
                  BIAE
                </label>
                <div>
                  <label className="text-xs text-slate-400 block">BEI (0-7)</label>
                  <input
                    type="number"
                    min={0}
                    max={7}
                    value={overhead.pm.bei}
                    onChange={(e) => updatePM("bei", Math.min(7, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full h-7 text-xs font-mono bg-slate-800/50 border border-slate-700/30 rounded px-2 text-slate-300 focus:border-cyan-500/50 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block">Signal Status</label>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={overhead.pm.status}
                  onChange={(e) => updatePM("status", Math.min(255, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full h-7 text-xs font-mono bg-slate-800/50 border border-slate-700/30 rounded px-2 text-slate-300 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
            </div>
          )}

          {activeTab === "tcm" && (
            <div className="space-y-4">
              {overhead.tcm.map((tcm, level) => (
                <div key={level} className="border border-slate-700/20 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-semibold text-cyan-400">TCM Level {tcm.level}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 text-[10px] text-slate-400">
                      <input type="checkbox" checked={tcm.bdi} onChange={(e) => updateTCM(level, "bdi", e.target.checked)} className="rounded border-slate-600 bg-slate-800 text-cyan-500" />
                      BDI
                    </label>
                    <label className="flex items-center gap-2 text-[10px] text-slate-400">
                      <input type="checkbox" checked={tcm.tim} onChange={(e) => updateTCM(level, "tim", e.target.checked)} className="rounded border-slate-600 bg-slate-800 text-cyan-500" />
                      TIM
                    </label>
                    <label className="flex items-center gap-2 text-[10px] text-slate-400">
                      <input type="checkbox" checked={tcm.ltc} onChange={(e) => updateTCM(level, "ltc", e.target.checked)} className="rounded border-slate-600 bg-slate-800 text-cyan-500" />
                      LTC
                    </label>
                    <label className="flex items-center gap-2 text-[10px] text-slate-400">
                      <input type="checkbox" checked={tcm.ais} onChange={(e) => updateTCM(level, "ais", e.target.checked)} className="rounded border-slate-600 bg-slate-800 text-cyan-500" />
                      AIS
                    </label>
                    <label className="flex items-center gap-2 text-[10px] text-slate-400">
                      <input type="checkbox" checked={tcm.oci} onChange={(e) => updateTCM(level, "oci", e.target.checked)} className="rounded border-slate-600 bg-slate-800 text-cyan-500" />
                      OCI
                    </label>
                    <label className="flex items-center gap-2 text-[10px] text-slate-400">
                      <input type="checkbox" checked={tcm.lck} onChange={(e) => updateTCM(level, "lck", e.target.checked)} className="rounded border-slate-600 bg-slate-800 text-cyan-500" />
                      LCK
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "opuk" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block">Payload Type (PT)</label>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={overhead.opuk.pt}
                  onChange={(e) => updateOPUk("pt", Math.min(255, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full h-7 text-xs font-mono bg-slate-800/50 border border-slate-700/30 rounded px-2 text-slate-300 focus:border-cyan-500/50 focus:outline-none"
                />
                <div className="text-[10px] text-slate-600 mt-0.5">
                  0x20=ODU0, 0x02=VT, 0x03=ATM, 0x0B=FP11
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block">Justification Control (JC)</label>
                <div className="flex gap-1">
                  {overhead.opuk.jc.map((v, i) => (
                    <input
                      key={i}
                      type="number"
                      min={0}
                      max={255}
                      value={v}
                      onChange={(e) => {
                        const newJc = [...overhead.opuk.jc];
                        newJc[i] = Math.min(255, Math.max(0, parseInt(e.target.value) || 0));
                        updateOPUk("jc", newJc);
                      }}
                      className="w-12 h-7 text-center text-[10px] font-mono bg-slate-800/50 border border-slate-700/30 rounded text-slate-300 focus:border-cyan-500/50 focus:outline-none"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block">Justification Opportunity (JO)</label>
                <div className="flex gap-1">
                  {overhead.opuk.jo.map((v, i) => (
                    <input
                      key={i}
                      type="number"
                      min={0}
                      max={255}
                      value={v}
                      onChange={(e) => {
                        const newJo = [...overhead.opuk.jo];
                        newJo[i] = Math.min(255, Math.max(0, parseInt(e.target.value) || 0));
                        updateOPUk("jo", newJo);
                      }}
                      className="w-12 h-7 text-center text-[10px] font-mono bg-slate-800/50 border border-slate-700/30 rounded text-slate-300 focus:border-cyan-500/50 focus:outline-none"
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block">NJO</label>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={overhead.opuk.njo}
                    onChange={(e) => updateOPUk("njo", Math.min(255, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full h-7 text-xs font-mono bg-slate-800/50 border border-slate-700/30 rounded px-2 text-slate-300 focus:border-cyan-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block">PJO</label>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={overhead.opuk.pjo}
                    onChange={(e) => updateOPUk("pjo", Math.min(255, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full h-7 text-xs font-mono bg-slate-800/50 border border-slate-700/30 rounded px-2 text-slate-300 focus:border-cyan-500/50 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "other" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block">FAS (帧对齐信号)</label>
                <div className="flex gap-1">
                  {overhead.fas.map((v, i) => (
                    <div key={i} className="w-10 h-7 flex items-center justify-center text-[10px] font-mono bg-slate-800/50 border border-slate-700/30 rounded text-slate-300">
                      {v.toString(16).padStart(2, "0").toUpperCase()}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block">MFAS (复帧对齐信号)</label>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={overhead.mfas}
                  onChange={(e) => {
                    const newOh = { ...overhead, mfas: Math.min(255, Math.max(0, parseInt(e.target.value) || 0)) };
                    setLocalOverhead(newOh);
                  }}
                  className="w-full h-7 text-xs font-mono bg-slate-800/50 border border-slate-700/30 rounded px-2 text-slate-300 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block">APS (自动保护倒换)</label>
                <div className="flex gap-1">
                  {overhead.aps.map((v, i) => (
                    <input
                      key={i}
                      type="number"
                      min={0}
                      max={255}
                      value={v}
                      onChange={(e) => {
                        const newAps = [...overhead.aps];
                        newAps[i] = Math.min(255, Math.max(0, parseInt(e.target.value) || 0));
                        setLocalOverhead({ ...overhead, aps: newAps });
                      }}
                      className="w-10 h-7 text-center text-[10px] font-mono bg-slate-800/50 border border-slate-700/30 rounded text-slate-300 focus:border-cyan-500/50 focus:outline-none"
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block">EXP (实验字节)</label>
                <div className="flex gap-1">
                  {overhead.exp.map((v, i) => (
                    <input
                      key={i}
                      type="number"
                      min={0}
                      max={255}
                      value={v}
                      onChange={(e) => {
                        const newExp = [...overhead.exp];
                        newExp[i] = Math.min(255, Math.max(0, parseInt(e.target.value) || 0));
                        setLocalOverhead({ ...overhead, exp: newExp });
                      }}
                      className="w-12 h-7 text-center text-[10px] font-mono bg-slate-800/50 border border-slate-700/30 rounded text-slate-300 focus:border-cyan-500/50 focus:outline-none"
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-slate-700/30">
          <button
            onClick={handleCancel}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-700/30 text-xs text-slate-400 hover:bg-slate-700/30 transition-all"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-xs text-cyan-400 hover:bg-cyan-500/20 transition-all disabled:opacity-50"
          >
            <Save size={12} />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
