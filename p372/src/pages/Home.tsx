import { useEffect } from "react";
import { useOTNStore } from "@/store/otnStore";
import FrameVisualizer from "@/components/FrameVisualizer";
import TimeslotPanel from "@/components/TimeslotPanel";
import ControlPanel from "@/components/ControlPanel";
import OverheadEditor from "@/components/OverheadEditor";
import DiagramModal from "@/components/DiagramModal";
import { AlertCircle, Loader2, Activity, Wifi } from "lucide-react";

export default function Home() {
  const { state, loading, error, fetchState } = useOTNStore();

  useEffect(() => {
    fetchState();
  }, []);

  return (
    <div className="min-h-screen bg-[#060E1A] text-slate-200">
      <header className="border-b border-slate-700/30 bg-[#0A1628]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_16px_rgba(0,212,255,0.3)]">
              <Activity size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide text-white">OTN 帧模拟器</h1>
              <p className="text-[10px] text-slate-500 -mt-0.5">ODUk 复用/解复用仿真工具</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {state && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                <Wifi size={12} className="text-cyan-400" />
                <span className="text-[10px] font-mono text-cyan-400">{state.oduType} | {state.mappingType}</span>
              </div>
            )}
            {loading && <Loader2 size={16} className="text-cyan-400 animate-spin" />}
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-[1800px] mx-auto px-6 mt-4">
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-xs text-red-400">
            <AlertCircle size={14} />
            {error}
          </div>
        </div>
      )}

      <main className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-3">
            <div className="bg-[#0A1628]/80 border border-slate-700/30 rounded-xl p-4 sticky top-20">
              <ControlPanel />
            </div>
          </div>
          <div className="col-span-6">
            <div className="bg-[#0A1628]/80 border border-slate-700/30 rounded-xl p-5">
              <FrameVisualizer />
            </div>
          </div>
          <div className="col-span-3">
            <div className="bg-[#0A1628]/80 border border-slate-700/30 rounded-xl p-4 sticky top-20">
              <TimeslotPanel />
            </div>
          </div>
        </div>
      </main>

      <OverheadEditor />
      <DiagramModal />
    </div>
  );
}
