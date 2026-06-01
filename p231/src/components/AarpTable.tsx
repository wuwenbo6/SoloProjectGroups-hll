import { ArrowLeftRight } from "lucide-react";
import { useCaptureStore } from "@/hooks/useCaptureStore";
import type { AarpMapping, AarpPacketEntry } from "@/lib/api";

function opcodeStyle(opcode: string) {
  switch (opcode) {
    case "Request":
      return "bg-cyan-400/15 text-cyan-400";
    case "Response":
      return "bg-emerald-400/15 text-emerald-400";
    case "Probe":
      return "bg-violet-400/15 text-violet-400";
    default:
      return "bg-atalk-border/30 text-atalk-muted";
  }
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AarpTable() {
  const aarp = useCaptureStore((s) => s.aarp);
  const mappings = aarp.mappings;
  const recentPackets = aarp.recent_packets;

  return (
    <div className="space-y-5">
      <div className="card-glow rounded-xl bg-atalk-surface/80 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-atalk-border">
          <ArrowLeftRight className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-atalk-text">AARP 地址映射</h2>
          <span className="ml-auto text-xs text-atalk-muted font-mono">
            {mappings.length} 条映射
          </span>
        </div>

        {mappings.length === 0 ? (
          <div className="px-5 py-12 text-center text-atalk-muted text-sm">
            暂无 AARP 映射，等待 AARP 数据包
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-atalk-muted text-xs uppercase tracking-wider border-b border-atalk-border/50">
                  <th className="px-5 py-2.5 text-left">MAC 地址</th>
                  <th className="px-5 py-2.5 text-left">AppleTalk 地址</th>
                  <th className="px-5 py-2.5 text-left">网络号</th>
                  <th className="px-5 py-2.5 text-left">节点号</th>
                  <th className="px-5 py-2.5 text-left">操作类型</th>
                  <th className="px-5 py-2.5 text-left">最近活动</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((entry: AarpMapping) => (
                  <tr
                    key={entry.mac}
                    className="border-b border-atalk-border/30 hover:bg-violet-400/5 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-atalk-text">
                      {entry.mac}
                    </td>
                    <td className="px-5 py-3 font-mono">
                      <span className="text-violet-400 font-semibold">
                        {entry.atalk_addr}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-atalk-text">
                      {entry.atalk_net}
                    </td>
                    <td className="px-5 py-3 font-mono text-atalk-text">
                      {entry.atalk_node}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${opcodeStyle(
                          entry.opcode
                        )}`}
                      >
                        {entry.opcode}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-atalk-muted font-mono whitespace-nowrap">
                      {formatTimestamp(entry.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recentPackets.length > 0 && (
        <div className="card-glow rounded-xl bg-atalk-surface/80 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-atalk-border">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            <h3 className="text-xs font-semibold text-atalk-muted uppercase tracking-wider">
              AARP 最近数据包
            </h3>
          </div>
          <div className="font-mono text-xs">
            {recentPackets.slice().reverse().map((pkt: AarpPacketEntry, idx: number) => (
              <div
                key={`${pkt.timestamp}-${idx}`}
                className="flex items-center gap-3 px-5 py-1.5 border-b border-atalk-border/20 hover:bg-violet-400/5 transition-colors"
              >
                <span className="text-atalk-muted flex-shrink-0">
                  {formatTimestamp(pkt.timestamp)}
                </span>
                <span
                  className={`w-16 flex-shrink-0 ${
                    pkt.opcode_name === "Request"
                      ? "text-cyan-400"
                      : pkt.opcode_name === "Response"
                      ? "text-emerald-400"
                      : "text-violet-400"
                  }`}
                >
                  {pkt.opcode_name}
                </span>
                <span className="text-atalk-text">
                  {pkt.src_mac}
                </span>
                <span className="text-violet-400">
                  {pkt.src_atalk_addr || "?"}
                </span>
                <span className="text-atalk-muted">→</span>
                <span className="text-atalk-text">
                  {pkt.dst_mac}
                </span>
                <span className="text-violet-400">
                  {pkt.dst_atalk_addr || "?"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
