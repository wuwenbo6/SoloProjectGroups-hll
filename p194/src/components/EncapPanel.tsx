import { useState } from "react";
import { encapsulate, exportPcapUrl, NEXT_PROTOCOL_OPTIONS, NSH_NEXT_PROTOCOL_OPTIONS, NSH_MD_TYPE_OPTIONS } from "@/utils/types";
import type { EncapsulateRequest, NshConfig, Preset } from "@/utils/types";
import { usePacketStore } from "@/store/usePacketStore";
import { Send, Loader2, Wand2, Download } from "lucide-react";

const DEFAULT_NSH: NshConfig = {
  ver: 0, oam: 0, md_type: 1, next_protocol: 3,
  spi: 256, si: 255,
  context_platform: 0, context_shared: 0,
  context_service_index: 0, context_reserved: 0,
};

const DEFAULT_REQ: EncapsulateRequest = {
  eth: { dst: "aa:bb:cc:dd:ee:ff", src: "11:22:33:44:55:66", type: 0x0800 },
  payload: "deadbeef01020304",
  outer_ip: { src: "10.0.0.1", dst: "10.0.0.2" },
  vni: 100,
  next_protocol: 0,
  udp_src_port: 50000,
  udp_dst_port: 4790,
};

const inputCls = "w-full bg-slate-900/60 border border-slate-700/40 rounded-md px-2.5 py-1.5 font-mono-display text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50";
const labelCls = "text-[10px] text-slate-500 uppercase tracking-wider";

interface EncapPanelProps {
  presets: Preset[];
}

export default function EncapPanel({ presets }: EncapPanelProps) {
  const [req, setReq] = useState<EncapsulateRequest>(DEFAULT_REQ);
  const [showNsh, setShowNsh] = useState(false);
  const [nshCfg, setNshCfg] = useState<NshConfig>({ ...DEFAULT_NSH });
  const [exporting, setExporting] = useState(false);
  const { setEncapResult, setLoading, setError, loading } = usePacketStore();

  const isNshMode = req.next_protocol === 4 || showNsh;

  const handleEncap = async () => {
    setLoading(true);
    const body = { ...req, nsh: isNshMode ? nshCfg : undefined };
    try {
      const result = await encapsulate(body);
      setEncapResult(result.layers, result.raw_hex);
    } catch (e: any) {
      setError(e.message);
    } finally {
      usePacketStore.setState({ loading: false });
    }
  };

  const handleExportPcap = async () => {
    setExporting(true);
    const body = { ...req, nsh: isNshMode ? nshCfg : undefined };
    try {
      const res = await fetch(exportPcapUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vxlan_gpe.pcap";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const loadPreset = (p: Preset) => {
    setReq(p.encapsulate_request);
    if (p.encapsulate_request.nsh) {
      setShowNsh(true);
      setNshCfg(p.encapsulate_request.nsh);
    } else {
      setShowNsh(false);
    }
  };

  const updateEth = (key: string, val: string | number) => {
    setReq({ ...req, eth: { ...req.eth, [key]: key === "type" ? (typeof val === "string" ? parseInt(val, 16) : val) : val } });
  };

  const updateOuterIp = (key: string, val: string) => {
    setReq({ ...req, outer_ip: { ...req.outer_ip, [key]: val } });
  };

  const handleNextProtoChange = (val: number) => {
    setReq({ ...req, next_protocol: val });
    if (val === 4) setShowNsh(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-ui text-lg font-semibold text-slate-200 flex items-center gap-2">
          <Send className="w-5 h-5 text-cyan-400" />
          封装模拟
        </h2>
        {presets.length > 0 && (
          <div className="flex items-center gap-2">
            <Wand2 className="w-3.5 h-3.5 text-slate-500" />
            <select
              className="bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-slate-300 px-2 py-1 font-ui focus:outline-none focus:border-cyan-500/50"
              onChange={(e) => {
                const p = presets.find((x) => x.name === e.target.value);
                if (p) loadPreset(p);
              }}
              defaultValue=""
            >
              <option value="" disabled>预设示例...</option>
              {presets.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <fieldset className="border border-blue-500/20 rounded-lg p-3 bg-blue-950/10">
          <legend className="text-xs font-ui font-medium text-blue-400 px-2">Inner Ethernet</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Dst MAC</label>
              <input className={inputCls} value={req.eth.dst} onChange={(e) => updateEth("dst", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Src MAC</label>
              <input className={inputCls} value={req.eth.src} onChange={(e) => updateEth("src", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>EtherType</label>
              <input
                className={inputCls}
                value={"0x" + req.eth.type.toString(16).padStart(4, "0")}
                onChange={(e) => {
                  const v = e.target.value.replace(/^0x/i, "");
                  updateEth("type", parseInt(v, 16) || 0x0800);
                }}
              />
            </div>
            <div>
              <label className={labelCls}>Payload (Hex)</label>
              <input className={inputCls} value={req.payload} onChange={(e) => setReq({ ...req, payload: e.target.value })} />
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-emerald-500/20 rounded-lg p-3 bg-emerald-950/10">
          <legend className="text-xs font-ui font-medium text-emerald-400 px-2">Outer IP</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Src IP</label>
              <input className={inputCls} value={req.outer_ip.src} onChange={(e) => updateOuterIp("src", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Dst IP</label>
              <input className={inputCls} value={req.outer_ip.dst} onChange={(e) => updateOuterIp("dst", e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className="border border-amber-500/20 rounded-lg p-3 bg-amber-950/10">
          <legend className="text-xs font-ui font-medium text-amber-400 px-2">UDP / VXLAN GPE</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Src Port</label>
              <input type="number" className={inputCls} value={req.udp_src_port || ""} onChange={(e) => setReq({ ...req, udp_src_port: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className={labelCls}>Dst Port</label>
              <input type="number" className={inputCls} value={req.udp_dst_port || 4790} onChange={(e) => setReq({ ...req, udp_dst_port: parseInt(e.target.value) || 4790 })} />
            </div>
            <div>
              <label className={labelCls}>VNI</label>
              <input type="number" className={inputCls} value={req.vni} onChange={(e) => setReq({ ...req, vni: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className={labelCls}>Next Protocol</label>
              <select className={inputCls} value={req.next_protocol} onChange={(e) => handleNextProtoChange(parseInt(e.target.value))}>
                {NEXT_PROTOCOL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        {isNshMode && (
          <fieldset className="border border-orange-500/20 rounded-lg p-3 bg-orange-950/10 animate-fade-in-up">
            <legend className="text-xs font-ui font-medium text-orange-400 px-2">NSH 网络服务头</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Version</label>
                <input type="number" className={inputCls} value={nshCfg.ver} onChange={(e) => setNshCfg({ ...nshCfg, ver: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <label className={labelCls}>OAM</label>
                <select className={inputCls} value={nshCfg.oam} onChange={(e) => setNshCfg({ ...nshCfg, oam: parseInt(e.target.value) })}>
                  <option value={0}>0 - Disabled</option>
                  <option value={1}>1 - Enabled</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>MD Type</label>
                <select className={inputCls} value={nshCfg.md_type} onChange={(e) => setNshCfg({ ...nshCfg, md_type: parseInt(e.target.value) })}>
                  {NSH_MD_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>NSH Next Protocol</label>
                <select className={inputCls} value={nshCfg.next_protocol} onChange={(e) => setNshCfg({ ...nshCfg, next_protocol: parseInt(e.target.value) })}>
                  {NSH_NEXT_PROTOCOL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>SPI (Service Path ID)</label>
                <input type="number" className={inputCls} value={nshCfg.spi} onChange={(e) => setNshCfg({ ...nshCfg, spi: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <label className={labelCls}>SI (Service Index)</label>
                <input type="number" className={inputCls} value={nshCfg.si} onChange={(e) => setNshCfg({ ...nshCfg, si: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            {nshCfg.md_type === 1 && (
              <div className="mt-3 pt-3 border-t border-orange-500/15">
                <div className="text-[10px] text-orange-400/70 uppercase tracking-wider mb-2">Context Header (16 bytes)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Platform Context</label>
                    <input type="number" className={inputCls} value={nshCfg.context_platform ?? 0} onChange={(e) => setNshCfg({ ...nshCfg, context_platform: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label className={labelCls}>Shared Context</label>
                    <input type="number" className={inputCls} value={nshCfg.context_shared ?? 0} onChange={(e) => setNshCfg({ ...nshCfg, context_shared: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label className={labelCls}>Service Index Context</label>
                    <input type="number" className={inputCls} value={nshCfg.context_service_index ?? 0} onChange={(e) => setNshCfg({ ...nshCfg, context_service_index: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label className={labelCls}>Reserved Context</label>
                    <input type="number" className={inputCls} value={nshCfg.context_reserved ?? 0} onChange={(e) => setNshCfg({ ...nshCfg, context_reserved: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>
            )}
          </fieldset>
        )}
      </div>

      <div className="flex gap-2">
        <button
          className="glow-btn flex-1 py-2.5 rounded-xl bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 font-ui font-semibold text-sm flex items-center justify-center gap-2 hover:bg-cyan-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          onClick={handleEncap}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {loading ? "封装中..." : "执行封装"}
        </button>
        <button
          className="py-2.5 px-4 rounded-xl bg-slate-700/30 border border-slate-600/40 text-slate-300 font-ui font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          onClick={handleExportPcap}
          disabled={exporting}
          title="导出 PCAP 文件"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          PCAP
        </button>
      </div>
    </div>
  );
}
