import type { AnalyzeSummary, TlsPhase } from "@/types/eapol";
import { User, Shield, Clock, Layers, Lock } from "lucide-react";

interface Props {
  summary: AnalyzeSummary;
  tlsPhases: TlsPhase[];
}

export default function SummaryBar({ summary, tlsPhases }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-[#111d2e] border-b border-slate-700/50">
      {summary.identity && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-400/10 border border-cyan-400/20">
          <User className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs font-mono text-cyan-300">{summary.identity}</span>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-400/10 border border-indigo-400/20">
        <Shield className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-xs font-mono text-indigo-300">{summary.authMethod}</span>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700/40 border border-slate-600/30">
        <Layers className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs text-slate-400">
          {summary.eapolFrames} / {summary.totalFrames} 帧
        </span>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700/40 border border-slate-600/30">
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-mono text-slate-400">{summary.duration}s</span>
      </div>

      {tlsPhases.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-400/10 border border-emerald-400/20">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs text-emerald-300">
            TLS 隧道 · {tlsPhases.length} 阶段
          </span>
        </div>
      )}
    </div>
  );
}
