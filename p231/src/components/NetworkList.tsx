import { Network, ChevronRight, Monitor, Printer, Server, HardDrive } from "lucide-react";
import { useCaptureStore } from "@/hooks/useCaptureStore";
import type { NetworkInfo, NodeInfo } from "@/lib/api";

const NETWORK_COLORS = [
  "bg-cyan-400",
  "bg-emerald-400",
  "bg-amber-400",
  "bg-rose-400",
  "bg-violet-400",
  "bg-blue-400",
  "bg-pink-400",
  "bg-orange-400",
];

function getNetworkColor(netNum: number) {
  return NETWORK_COLORS[netNum % NETWORK_COLORS.length];
}

function getDeviceIcon(typeName?: string) {
  if (!typeName) return Monitor;
  const t = typeName.toLowerCase();
  if (t.includes("laser") || t.includes("writer") || t.includes("printer") || t.includes("stylewriter") || t.includes("imagewriter")) return Printer;
  if (t.includes("share") || t.includes("afp") || t.includes("server")) return Server;
  if (t.includes("talk")) return HardDrive;
  return Monitor;
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function NetworkList() {
  const networks = useCaptureStore((s) => s.networks);
  const entries = Object.values(networks).sort(
    (a, b) => a.network_number - b.network_number
  );

  return (
    <div className="card-glow rounded-xl bg-atalk-surface/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-atalk-border">
        <Network className="w-4 h-4 text-atalk-accent" />
        <h2 className="text-sm font-semibold text-atalk-text">网络列表</h2>
        <span className="ml-auto text-xs text-atalk-muted font-mono">
          {entries.length} 个网络
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="px-5 py-12 text-center text-atalk-muted text-sm">
          暂无发现的网络，请启动捕获
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-atalk-muted text-xs uppercase tracking-wider border-b border-atalk-border/50">
                <th className="px-5 py-2.5 text-left">网络号</th>
                <th className="px-5 py-2.5 text-left">节点数</th>
                <th className="px-5 py-2.5 text-left">节点列表</th>
                <th className="px-5 py-2.5 text-left">最近活动</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((net: NetworkInfo) => {
                const nodes = Object.values(net.nodes);
                const colorDot = getNetworkColor(net.network_number);
                return (
                  <tr
                    key={net.network_number}
                    className="border-b border-atalk-border/30 hover:bg-atalk-accent/5 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${colorDot}`}
                        />
                        <span className="text-atalk-accent font-semibold">
                          {net.network_number}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-atalk-text">
                      {nodes.length}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {nodes.slice(0, 8).map((node: NodeInfo) => {
                          const DeviceIcon = getDeviceIcon(node.device_type);
                          return (
                            <span
                              key={node.node_id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-atalk-bg text-xs font-mono text-atalk-text"
                            >
                              {node.device_name ? (
                                <DeviceIcon className="w-3 h-3 text-rose-400" />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-atalk-muted" />
                              )}
                              <span className={node.device_name ? "text-rose-400" : ""}>
                                {node.device_name || node.node_id}
                              </span>
                              {node.sockets.length > 0 && (
                                <span className="text-atalk-muted">
                                  :{node.sockets.join(",")}
                                </span>
                              )}
                            </span>
                          );
                        })}
                        {nodes.length > 8 && (
                          <span className="text-xs text-atalk-muted self-center">
                            +{nodes.length - 8}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-atalk-muted font-mono whitespace-nowrap">
                      {formatRelativeTime(net.last_seen)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
