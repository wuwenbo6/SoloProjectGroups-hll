import { useState } from "react";
import { decapsulate } from "@/utils/types";
import type { NshConfig } from "@/utils/types";
import { usePacketStore } from "@/store/usePacketStore";
import { Unplug, Loader2, ClipboardPaste } from "lucide-react";

export default function DecapPanel() {
  const [rawHex, setRawHex] = useState("");
  const { setDecapResult, setLoading, setError, encapRawHex, loading, decapInnerEth } = usePacketStore();
  const [decapNsh, setDecapNsh] = useState<NshConfig | null>(null);

  const handleDecap = async () => {
    if (!rawHex.trim()) return;
    setLoading(true);
    try {
      const result = await decapsulate({ raw_hex: rawHex.trim() });
      setDecapResult(result.layers, result.inner_ethernet ?? null);
      setDecapNsh(result.nsh ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      usePacketStore.setState({ loading: false });
    }
  };

  const pasteFromEncap = () => {
    if (encapRawHex) {
      setRawHex(encapRawHex);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="font-ui text-lg font-semibold text-slate-200 flex items-center gap-2">
        <Unplug className="w-5 h-5 text-purple-400" />
        解封装模拟
      </h2>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">VXLAN GPE 报文 (Hex)</label>
          {encapRawHex && (
            <button
              className="flex items-center gap-1 text-[10px] text-cyan-500 hover:text-cyan-300 transition-colors"
              onClick={pasteFromEncap}
            >
              <ClipboardPaste className="w-3 h-3" />
              从封装结果填入
            </button>
          )}
        </div>
        <textarea
          className="hex-input w-full h-40 bg-slate-900/60 border border-slate-700/40 rounded-lg px-3 py-2 font-mono-display text-xs text-slate-300 focus:outline-none focus:border-purple-500/50 resize-none"
          placeholder="输入十六进制报文，如：ffff0000000a0000..."
          value={rawHex}
          onChange={(e) => setRawHex(e.target.value)}
        />
      </div>

      {decapNsh && (
        <div className="border border-orange-500/20 rounded-lg p-3 bg-orange-950/10 animate-fade-in-up">
          <h3 className="text-xs font-ui font-medium text-orange-400 mb-2">NSH 网络服务头</h3>
          <div className="grid grid-cols-2 gap-2 font-mono-display text-xs">
            <div className="text-slate-500">Version</div>
            <div className="text-orange-300">{decapNsh.ver}</div>
            <div className="text-slate-500">OAM</div>
            <div className="text-orange-300">{decapNsh.oam}</div>
            <div className="text-slate-500">MD Type</div>
            <div className="text-orange-300">{decapNsh.md_type}</div>
            <div className="text-slate-500">Next Protocol</div>
            <div className="text-orange-300">{decapNsh.next_protocol}</div>
            <div className="text-slate-500">SPI</div>
            <div className="text-orange-300">{decapNsh.spi}</div>
            <div className="text-slate-500">SI</div>
            <div className="text-orange-300">{decapNsh.si}</div>
            {decapNsh.context_platform !== undefined && (
              <>
                <div className="text-slate-500">Context Platform</div>
                <div className="text-orange-300">{decapNsh.context_platform}</div>
                <div className="text-slate-500">Context Shared</div>
                <div className="text-orange-300">{decapNsh.context_shared}</div>
                <div className="text-slate-500">Context Svc Index</div>
                <div className="text-orange-300">{decapNsh.context_service_index}</div>
                <div className="text-slate-500">Context Reserved</div>
                <div className="text-orange-300">{decapNsh.context_reserved}</div>
              </>
            )}
          </div>
        </div>
      )}

      {decapInnerEth && (
        <div className="border border-cyan-500/20 rounded-lg p-3 bg-cyan-950/10 animate-fade-in-up">
          <h3 className="text-xs font-ui font-medium text-cyan-400 mb-2">恢复的 Inner Ethernet 帧</h3>
          <div className="grid grid-cols-2 gap-2 font-mono-display text-xs">
            <div className="text-slate-500">Dst MAC</div>
            <div className="text-cyan-300">{decapInnerEth.dst}</div>
            <div className="text-slate-500">Src MAC</div>
            <div className="text-cyan-300">{decapInnerEth.src}</div>
            <div className="text-slate-500">Type</div>
            <div className="text-cyan-300">{decapInnerEth.type}</div>
            <div className="text-slate-500">Payload</div>
            <div className="text-cyan-300 break-all">{decapInnerEth.payload}</div>
          </div>
        </div>
      )}

      <button
        className="glow-btn w-full py-2.5 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-300 font-ui font-semibold text-sm flex items-center justify-center gap-2 hover:bg-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        onClick={handleDecap}
        disabled={loading || !rawHex.trim()}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
        {loading ? "解封装中..." : "执行解封装"}
      </button>
    </div>
  );
}
