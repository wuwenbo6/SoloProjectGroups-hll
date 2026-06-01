import { useOTNStore } from "@/store/otnStore";
import { X, Download, Copy, Check } from "lucide-react";
import { useState } from "react";

export default function DiagramModal() {
  const diagram = useOTNStore((s) => s.muxDiagram);
  const isOpen = useOTNStore((s) => s.diagramModalOpen);
  const loading = useOTNStore((s) => s.loading);
  const { setDiagramModalOpen } = useOTNStore();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleExportSVG = () => {
    if (!diagram?.svgText) return;
    const blob = new Blob([diagram.svgText], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mux_diagram_${diagram.server.oduType}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    if (!diagram) return;
    const dataStr = JSON.stringify(diagram, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mux_diagram_${diagram.server.oduType}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyMermaid = async () => {
    if (!diagram?.mermaid) return;
    await navigator.clipboard.writeText(diagram.mermaid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0A1628] border border-slate-700/50 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-cyan-300">复用结构图</h3>
            {diagram && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700/30 text-slate-400">
                {diagram.server.oduType} · {diagram.server.usedTimeslots}/{diagram.server.totalTimeslots} TS
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportSVG}
              disabled={loading || !diagram?.svgText}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-all disabled:opacity-30"
            >
              <Download size={12} />
              SVG
            </button>
            <button
              onClick={handleExportJSON}
              disabled={loading || !diagram}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all disabled:opacity-30"
            >
              <Download size={12} />
              JSON
            </button>
            <button
              onClick={handleCopyMermaid}
              disabled={loading || !diagram?.mermaid}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-all disabled:opacity-30"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "已复制" : "Mermaid"}
            </button>
            <button
              onClick={() => setDiagramModalOpen(false)}
              className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/30 transition-all"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
              加载中...
            </div>
          ) : diagram?.svgText ? (
            <div
              className="flex justify-center"
              dangerouslySetInnerHTML={{ __html: diagram.svgText }}
            />
          ) : diagram ? (
            <div className="space-y-4">
              <div className="bg-slate-800/30 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-slate-300 mb-2">服务端信息</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                  <div>
                    <div className="text-slate-500">ODU类型</div>
                    <div className="text-cyan-400 font-mono">{diagram.server.oduType}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">带宽</div>
                    <div className="text-slate-200 font-mono">{diagram.server.bitrateGbps.toFixed(3)} Gbps</div>
                  </div>
                  <div>
                    <div className="text-slate-500">时隙使用</div>
                    <div className="text-amber-400 font-mono">{diagram.server.usedTimeslots}/{diagram.server.totalTimeslots}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">映射方式</div>
                    <div className="text-green-400 font-mono">{diagram.server.mappingType}</div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/30 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-slate-300 mb-2">客户端信号 ({diagram.clients.length})</h4>
                <div className="space-y-2">
                  {diagram.clients.map((client, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-3 py-2 rounded border ${
                        client.mapped
                          ? "bg-green-500/5 border-green-500/20"
                          : "bg-slate-700/20 border-slate-700/30"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-400" />
                        <div>
                          <div className="text-xs font-mono text-slate-200">{client.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {client.signalType} · {client.bitrateGbps.toFixed(3)} Gbps · {client.tsRange || `${client.tsCount}TS`}
                          </div>
                        </div>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded ${
                        client.mapped
                          ? "bg-green-500/10 text-green-400 border border-green-500/20"
                          : "bg-slate-700/30 text-slate-500 border border-slate-700/20"
                      }`}>
                        {client.mapped ? "已映射" : "未映射"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
              无数据
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
