import {
  Radio,
  Cpu,
  Route,
  Wifi,
  ArrowLeftRight,
  Tags,
} from "lucide-react";
import { useCaptureStore } from "@/hooks/useCaptureStore";

const cards = [
  {
    key: "total",
    label: "总数据包",
    icon: Radio,
    getValue: (s: CaptureStatus) => s.stats.total_packets,
    color: "text-atalk-accent",
    glow: "rgba(34,211,238,0.15)",
  },
  {
    key: "ddp",
    label: "DDP 数据包",
    icon: Cpu,
    getValue: (s: CaptureStatus) => s.stats.ddp_packets,
    color: "text-cyan-400",
    glow: "rgba(34,211,238,0.1)",
  },
  {
    key: "rip",
    label: "RIP 数据包",
    icon: Route,
    getValue: (s: CaptureStatus) => s.stats.rip_packets,
    color: "text-atalk-warn",
    glow: "rgba(245,158,11,0.1)",
  },
  {
    key: "aarp",
    label: "AARP 数据包",
    icon: ArrowLeftRight,
    getValue: (s: CaptureStatus) => s.stats.aarp_packets,
    color: "text-violet-400",
    glow: "rgba(167,139,250,0.1)",
  },
  {
    key: "nbp",
    label: "NBP 数据包",
    icon: Tags,
    getValue: (s: CaptureStatus) => s.stats.nbp_packets,
    color: "text-rose-400",
    glow: "rgba(251,113,133,0.1)",
  },
  {
    key: "networks",
    label: "已发现网络",
    icon: Wifi,
    getValue: (s: CaptureStatus) => s.networks_count,
    color: "text-atalk-good",
    glow: "rgba(34,197,94,0.1)",
  },
];

interface CaptureStatus {
  stats: { total_packets: number; ddp_packets: number; rip_packets: number; aarp_packets: number; nbp_packets: number };
  networks_count: number;
}

export default function StatsCards() {
  const status = useCaptureStore((s) => s.status);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        const value = status ? card.getValue(status as CaptureStatus) : 0;
        return (
          <div
            key={card.key}
            className="animate-fade-in-up card-glow rounded-xl bg-atalk-surface/80 backdrop-blur-sm p-5 transition-all duration-300 hover:scale-[1.02]"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-atalk-muted text-sm font-medium">
                {card.label}
              </span>
              <div
                className="p-2 rounded-lg"
                style={{ background: card.glow }}
              >
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>
            <div className={`font-mono text-3xl font-bold ${card.color} glow-text tracking-tight`}>
              {value.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
