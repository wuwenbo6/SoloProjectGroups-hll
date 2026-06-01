import { memo } from "react";
import { Handle, Position } from "reactflow";
import { Shield, Router } from "lucide-react";

const statusColors: Record<string, { border: string; glow: string; bg: string; dot: string }> = {
  running: { border: "border-[#00FF88]/60", glow: "shadow-[0_0_24px_rgba(0,255,136,0.2)]", bg: "bg-[#00FF88]/10", dot: "bg-[#00FF88]" },
  instantiating: { border: "border-cyan-400/60", glow: "shadow-[0_0_24px_rgba(0,240,255,0.2)]", bg: "bg-cyan-400/10", dot: "bg-cyan-400 animate-pulse" },
  scaling: { border: "border-amber-400/60", glow: "shadow-[0_0_24px_rgba(255,184,0,0.2)]", bg: "bg-amber-400/10", dot: "bg-amber-400 animate-pulse" },
  terminating: { border: "border-rose-400/60", glow: "shadow-[0_0_24px_rgba(255,51,102,0.2)]", bg: "bg-rose-400/10", dot: "bg-rose-400 animate-pulse" },
  stopped: { border: "border-gray-500/40", glow: "", bg: "bg-gray-500/10", dot: "bg-gray-500" },
  error: { border: "border-[#FF3366]/60", glow: "shadow-[0_0_24px_rgba(255,51,102,0.3)]", bg: "bg-[#FF3366]/10", dot: "bg-[#FF3366]" },
  waiting: { border: "border-slate-500/60", glow: "", bg: "bg-slate-500/10", dot: "bg-slate-500" },
};

function VnfNodeComponent({ data }: { data: { label: string; type: string; status: string; replicas: number } }) {
  const cfg = statusColors[data.status] || statusColors.stopped;
  const Icon = data.type === "firewall" ? Shield : Router;

  return (
    <div
      className={`relative rounded-xl border-2 ${cfg.border} ${cfg.glow} bg-[#0F1A2E] px-4 py-3 min-w-[160px] transition-all duration-300`}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyan-400 !w-2 !h-2 !border-0" />
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${cfg.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${data.type === "firewall" ? "text-cyan-400" : "text-amber-400"}`} />
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-100 leading-tight">{data.label}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            <span className="text-[10px] text-gray-500 uppercase font-mono">{data.status}</span>
            {data.replicas > 1 && (
              <span className="text-[10px] text-amber-400 font-mono">×{data.replicas}</span>
            )}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-400 !w-2 !h-2 !border-0" />
    </div>
  );
}

export const VnfNode = memo(VnfNodeComponent);
