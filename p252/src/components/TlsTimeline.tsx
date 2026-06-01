import type { TlsPhase } from "@/types/eapol";
import { cn } from "@/lib/utils";

interface Props {
  phases: TlsPhase[];
}

function getPhaseStyle(name: string) {
  switch (name) {
    case "ClientHello":
      return {
        bg: "bg-cyan-400/10",
        border: "border-cyan-400/30",
        text: "text-cyan-300",
        dot: "bg-cyan-400",
      };
    case "ServerHello":
      return {
        bg: "bg-indigo-400/10",
        border: "border-indigo-400/30",
        text: "text-indigo-300",
        dot: "bg-indigo-400",
      };
    case "KeyExchange":
      return {
        bg: "bg-amber-400/10",
        border: "border-amber-400/30",
        text: "text-amber-300",
        dot: "bg-amber-400",
      };
    case "Finished":
      return {
        bg: "bg-emerald-400/10",
        border: "border-emerald-400/30",
        text: "text-emerald-300",
        dot: "bg-emerald-400",
      };
    default:
      return {
        bg: "bg-slate-700/30",
        border: "border-slate-600/30",
        text: "text-slate-400",
        dot: "bg-slate-500",
      };
  }
}

export default function TlsTimeline({ phases }: Props) {
  if (phases.length === 0) return null;

  return (
    <div className="px-5 py-4 bg-[#0d1b2a] border-t border-slate-700/50">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3">
        TLS 隧道建立过程
      </h3>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {phases.map((phase, idx) => {
          const style = getPhaseStyle(phase.name);
          return (
            <div key={idx} className="flex items-center gap-2 shrink-0">
              {idx > 0 && (
                <div className="w-6 h-px bg-slate-700" />
              )}
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border",
                  style.bg,
                  style.border
                )}
              >
                <div className={cn("w-2 h-2 rounded-full", style.dot)} />
                <div>
                  <p className={cn("text-xs font-semibold", style.text)}>
                    {phase.name}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5 max-w-[180px] truncate">
                    {phase.description}
                  </p>
                </div>
                <span className="text-[10px] text-slate-600 font-mono ml-1">
                  #{phase.startMessageId}-{phase.endMessageId}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
