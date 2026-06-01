import { useManoStore } from "@/store";
import { AlertTriangle, Info, XCircle } from "lucide-react";

const typeConfig = {
  info: { icon: Info, color: "text-cyan-400", bg: "bg-cyan-500/10", bar: "bg-cyan-400" },
  warning: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", bar: "bg-amber-400" },
  error: { icon: XCircle, color: "text-rose-400", bg: "bg-rose-500/10", bar: "bg-rose-400" },
};

export default function EventPanel() {
  const events = useManoStore((s) => s.events);
  const sorted = [...events].reverse().slice(0, 20);

  return (
    <div className="rounded-xl border border-cyan-900/30 bg-[#0F1A2E] overflow-hidden">
      <div className="px-5 py-4 border-b border-cyan-900/20">
        <h2 className="text-sm font-semibold text-gray-200 tracking-wide">最近事件</h2>
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {sorted.length === 0 && (
          <div className="px-5 py-8 text-center text-gray-600 text-sm">暂无事件</div>
        )}
        {sorted.map((evt) => {
          const cfg = typeConfig[evt.type as keyof typeof typeConfig] || typeConfig.info;
          const Icon = cfg.icon;
          return (
            <div key={evt.id} className="flex items-start gap-3 px-5 py-3 border-b border-cyan-900/10 hover:bg-cyan-900/5 transition-colors">
              <div className={`w-1 self-stretch rounded-full ${cfg.bar} flex-shrink-0`} />
              <div className={`w-6 h-6 rounded ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-300 leading-snug">{evt.message}</p>
                <p className="text-xs text-gray-600 mt-1 font-mono">
                  {new Date(evt.timestamp).toLocaleTimeString("zh-CN")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
