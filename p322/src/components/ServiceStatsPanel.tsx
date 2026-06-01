import { SERVICE_TYPE_LABELS, SERVICE_TYPE_COLORS } from "@/utils/types";
import type { ServiceType } from "@/utils/types";

interface ServiceStatsPanelProps {
  stats: Record<string, number>;
}

export default function ServiceStatsPanel({ stats }: ServiceStatsPanelProps) {
  const entries = Object.entries(stats).filter(([, v]) => v > 0);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return (
    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl p-5">
      <h3 className="font-dm text-sm font-semibold text-white mb-4">
        Service Types
      </h3>
      <div className="flex items-center justify-center mb-5">
        <div className="relative">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="#1e293b"
              strokeWidth="14"
            />
            {entries.map(([type, count]) => {
              const fraction = total > 0 ? count / total : 0;
              const dashLength = fraction * circumference;
              const offset = -(accumulated * circumference);
              accumulated += fraction;
              const color =
                SERVICE_TYPE_COLORS[type as ServiceType] || "#94a3b8";
              return (
                <circle
                  key={type}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth="14"
                  strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                  transform="rotate(-90 80 80)"
                  className="transition-all duration-700"
                  style={{ opacity: 0.85 }}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-2xl font-bold text-white">
              {total}
            </span>
            <span className="text-[10px] text-gray-500 font-dm">online</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {entries.map(([type, count]) => {
          const color =
            SERVICE_TYPE_COLORS[type as ServiceType] || "#94a3b8";
          const label =
            SERVICE_TYPE_LABELS[type as ServiceType] || type;
          return (
            <div key={type} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[11px] text-gray-400 font-dm truncate">
                {label}
              </span>
              <span className="text-[11px] font-mono text-white ml-auto">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
