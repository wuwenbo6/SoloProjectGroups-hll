import { useState } from "react";
import { useEapolStore } from "@/store/eapolStore";
import { useNavigate } from "react-router-dom";
import SequenceDiagram from "@/components/SequenceDiagram";
import MessageDetail from "@/components/MessageDetail";
import SummaryBar from "@/components/SummaryBar";
import TlsTimeline from "@/components/TlsTimeline";
import CertificateChain from "@/components/CertificateChain";
import { ArrowLeft, Radio, RadioIcon } from "lucide-react";

export default function AnalysisPage() {
  const { analysis, selectedMessage, selectMessage } = useEapolStore();
  const navigate = useNavigate();
  const [showRadius, setShowRadius] = useState(true);

  if (!analysis) {
    return (
      <div className="min-h-screen bg-[#070f1d] flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-slate-500">暂无分析数据</p>
        <button
          onClick={() => navigate("/")}
          className="px-4 py-2 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
        >
          返回首页
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#070f1d]">
      <SummaryBar summary={analysis.summary} tlsPhases={analysis.tlsPhases} />

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700/50 bg-[#111d2e]">
            <button
              onClick={() => {
                selectMessage(null);
                navigate("/");
              }}
              className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-500 font-mono">
              消息序列图 · {analysis.messages.length} 条 EAP 消息
              {analysis.radiusMessages.length > 0 && ` · ${analysis.radiusMessages.length} 条 RADIUS`}
            </span>

            <div className="flex-1" />

            {analysis.radiusMessages.length > 0 && (
              <button
                onClick={() => setShowRadius(!showRadius)}
                className={showRadius ? "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono bg-purple-400/10 text-purple-300 border border-purple-400/20 transition-colors" : "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300 transition-colors"}
              >
                {showRadius ? <Radio className="w-3 h-3" /> : <RadioIcon className="w-3 h-3" />}
                RADIUS
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 p-4">
            <SequenceDiagram
              messages={analysis.messages}
              radiusMessages={analysis.radiusMessages}
              tlsPhases={analysis.tlsPhases}
              selectedId={selectedMessage?.id ?? null}
              showRadius={showRadius}
              onSelect={selectMessage}
            />
          </div>

          <TlsTimeline phases={analysis.tlsPhases} />
          <CertificateChain certificates={analysis.certificateChain} analysisId={analysis.id} />
        </div>

        {selectedMessage && (
          <div className="w-[360px] shrink-0">
            <MessageDetail
              message={selectedMessage}
              onClose={() => selectMessage(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
