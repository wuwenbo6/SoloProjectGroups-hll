import { Route } from "lucide-react";
import { useCaptureStore } from "@/hooks/useCaptureStore";
import type { RouteEntry } from "@/lib/api";

function hopColor(hop: number) {
  if (hop <= 4) return "text-atalk-good";
  if (hop <= 10) return "text-atalk-warn";
  return "text-atalk-danger";
}

function hopBg(hop: number) {
  if (hop <= 4) return "bg-emerald-400/10 text-emerald-400";
  if (hop <= 10) return "bg-amber-400/10 text-amber-400";
  return "bg-red-400/10 text-red-400";
}

function statusBadge(status: string) {
  if (status === "good") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-400/15 text-emerald-400">
        可达
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-400/15 text-red-400">
      不可达
    </span>
  );
}

export default function RipRouteTable() {
  const routes = useCaptureStore((s) => s.routes);

  return (
    <div className="card-glow rounded-xl bg-atalk-surface/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-atalk-border">
        <Route className="w-4 h-4 text-atalk-warn" />
        <h2 className="text-sm font-semibold text-atalk-text">RIP 路由表</h2>
        <span className="ml-auto text-xs text-atalk-muted font-mono">
          {routes.length} 条路由
        </span>
      </div>

      {routes.length === 0 ? (
        <div className="px-5 py-12 text-center text-atalk-muted text-sm">
          暂无路由条目，等待 RTMP 数据包
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-atalk-muted text-xs uppercase tracking-wider border-b border-atalk-border/50">
                <th className="px-5 py-2.5 text-left">目的网络</th>
                <th className="px-5 py-2.5 text-left">下一跳</th>
                <th className="px-5 py-2.5 text-left">跳数</th>
                <th className="px-5 py-2.5 text-left">状态</th>
                <th className="px-5 py-2.5 text-left">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route: RouteEntry, idx: number) => (
                <tr
                  key={`${route.destination}-${idx}`}
                  className="border-b border-atalk-border/30 hover:bg-atalk-accent/5 transition-colors"
                >
                  <td className="px-5 py-3 font-mono">
                    <span className="text-atalk-accent font-semibold">
                      {route.destination}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-atalk-text">
                    {route.next_hop}
                  </td>
                  <td className="px-5 py-3 font-mono">
                    <span
                      className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-bold ${hopBg(
                        route.hop_count
                      )}`}
                    >
                      {route.hop_count}
                    </span>
                  </td>
                  <td className="px-5 py-3">{statusBadge(route.status)}</td>
                  <td className="px-5 py-3 text-xs text-atalk-muted font-mono whitespace-nowrap">
                    {new Date(route.last_updated).toLocaleTimeString("zh-CN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
