import { useManoStore } from "@/store";
import { Monitor, Cpu, HardDrive, Wifi } from "lucide-react";

const cards = [
  { key: "runningVnfs", label: "运行中", icon: Monitor, color: "text-[#00FF88]", bg: "bg-[#00FF88]/10", border: "border-[#00FF88]/20", glow: "shadow-[0_0_20px_rgba(0,255,136,0.08)]" },
  { key: "stoppedVnfs", label: "已停止", icon: Monitor, color: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/20", glow: "" },
  { key: "totalCpu", label: "CPU (核)", icon: Cpu, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20", glow: "shadow-[0_0_20px_rgba(0,240,255,0.08)]" },
  { key: "totalMemory", label: "内存 (MB)", icon: HardDrive, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", glow: "shadow-[0_0_20px_rgba(255,184,0,0.08)]" },
  { key: "totalBandwidth", label: "带宽 (Mbps)", icon: Wifi, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", glow: "shadow-[0_0_20px_rgba(168,85,247,0.08)]" },
] as const;

export default function StatsCards() {
  const stats = useManoStore((s) => s.stats);

  return (
    <div className="grid grid-cols-5 gap-4">
      {cards.map((card) => {
        const value = stats[card.key as keyof typeof stats];
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className={`relative overflow-hidden rounded-xl border ${card.border} bg-[#0F1A2E] ${card.glow} p-5 transition-all duration-300 hover:scale-[1.02]`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 uppercase tracking-wider">{card.label}</span>
              <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>
            <div className={`font-mono text-3xl font-bold ${card.color} tracking-tight`}>
              {value}
            </div>
            {card.key === "runningVnfs" && (
              <div className="absolute top-0 right-0 w-16 h-16 bg-[#00FF88]/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            )}
          </div>
        );
      })}
    </div>
  );
}
