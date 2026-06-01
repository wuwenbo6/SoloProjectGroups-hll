import { useEffect, useState } from "react";
import EncapPanel from "@/components/EncapPanel";
import DecapPanel from "@/components/DecapPanel";
import ProtocolStack from "@/components/ProtocolStack";
import { usePacketStore } from "@/store/usePacketStore";
import { fetchPresets } from "@/utils/types";
import type { Preset } from "@/utils/types";
import { Network, AlertCircle, X } from "lucide-react";

type TabType = "encap" | "decap";

export default function Home() {
  const [tab, setTab] = useState<TabType>("encap");
  const [presets, setPresets] = useState<Preset[]>([]);
  const {
    encapLayers,
    encapRawHex,
    decapLayers,
    selectedLayerIndex,
    error,
    selectLayer,
    setError,
  } = usePacketStore();

  useEffect(() => {
    fetchPresets()
      .then(setPresets)
      .catch(() => {});
  }, []);

  const currentLayers = tab === "encap" ? encapLayers : decapLayers;
  const currentRawHex = tab === "encap" ? encapRawHex : "";

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      <header className="border-b border-slate-800/60 bg-slate-950/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Network className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-ui text-lg font-bold text-slate-100 tracking-tight">
              VXLAN GPE 协议模拟器
            </h1>
            <p className="text-[10px] text-slate-500 tracking-wide">
              Virtual eXtensible LAN Generic Protocol Extension
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto px-6 mt-4">
          <div className="flex items-center gap-2 bg-red-950/40 border border-red-500/30 rounded-lg px-4 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-300 font-ui flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <div className="flex rounded-xl bg-slate-900/50 border border-slate-800/40 p-1">
              <button
                className={`flex-1 py-2 rounded-lg font-ui text-sm font-medium transition-all ${
                  tab === "encap"
                    ? "bg-cyan-600/20 text-cyan-300 shadow-inner"
                    : "text-slate-500 hover:text-slate-300"
                }`}
                onClick={() => setTab("encap")}
              >
                封装
              </button>
              <button
                className={`flex-1 py-2 rounded-lg font-ui text-sm font-medium transition-all ${
                  tab === "decap"
                    ? "bg-purple-600/20 text-purple-300 shadow-inner"
                    : "text-slate-500 hover:text-slate-300"
                }`}
                onClick={() => setTab("decap")}
              >
                解封装
              </button>
            </div>

            <div className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-4">
              {tab === "encap" ? (
                <EncapPanel presets={presets} />
              ) : (
                <DecapPanel />
              )}
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-5">
              <h2 className="font-ui text-sm font-semibold text-slate-400 mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                协议栈可视化
              </h2>
              <ProtocolStack
                layers={currentLayers}
                rawHex={currentRawHex}
                selectedLayerIndex={selectedLayerIndex}
                onSelectLayer={selectLayer}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
