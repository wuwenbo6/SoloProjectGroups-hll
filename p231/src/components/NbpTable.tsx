import { Tags, Monitor, Printer, Server, HardDrive } from "lucide-react";
import { useCaptureStore } from "@/hooks/useCaptureStore";
import type { NbpDevice, NbpPacketEntry } from "@/lib/api";

function getDeviceIcon(typeName: string) {
  const t = typeName.toLowerCase();
  if (t.includes("laser") || t.includes("writer") || t.includes("printer") || t.includes("stylewriter") || t.includes("imagewriter")) return Printer;
  if (t.includes("share") || t.includes("afp") || t.includes("server")) return Server;
  if (t.includes("talk")) return HardDrive;
  return Monitor;
}

function deviceTypeBadge(typeName: string) {
  const t = typeName.toLowerCase();
  if (t.includes("laser") || t.includes("writer") || t.includes("printer") || t.includes("stylewriter") || t.includes("imagewriter")) {
    return "bg-amber-400/15 text-amber-400";
  }
  if (t.includes("share") || t.includes("afp") || t.includes("server")) {
    return "bg-blue-400/15 text-blue-400";
  }
  if (t.includes("macintosh")) {
    return "bg-emerald-400/15 text-emerald-400";
  }
  return "bg-rose-400/15 text-rose-400";
}

function functionStyle(func: string) {
  switch (func) {
    case "LkUp-Reply":
      return "bg-emerald-400/15 text-emerald-400";
    case "LkUp":
      return "bg-cyan-400/15 text-cyan-400";
    case "BRRq":
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

export default function NbpTable() {
  const nbp = useCaptureStore((s) => s.nbp);
  const devices = nbp.devices;
  const recentPackets = nbp.recent_packets;

  return (
    <div className="space-y-5">
      <div className="card-glow rounded-xl bg-atalk-surface/80 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-atalk-border">
          <Tags className="w-4 h-4 text-rose-400" />
          <h2 className="text-sm font-semibold text-atalk-text">NBP 设备名称</h2>
          <span className="ml-auto text-xs text-atalk-muted font-mono">
            {devices.length} 个设备
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="px-5 py-12 text-center text-atalk-muted text-sm">
            暂无设备名称，等待 NBP 数据包
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-atalk-muted text-xs uppercase tracking-wider border-b border-atalk-border/50">
                  <th className="px-5 py-2.5 text-left">AppleTalk 地址</th>
                  <th className="px-5 py-2.5 text-left">设备名称</th>
                  <th className="px-5 py-2.5 text-left">设备类型</th>
                  <th className="px-5 py-2.5 text-left">类型说明</th>
                  <th className="px-5 py-2.5 text-left">区域</th>
                  <th className="px-5 py-2.5 text-left">最近活动</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((dev: NbpDevice) => {
                  const DeviceIcon = getDeviceIcon(dev.type_name);
                  return (
                    <tr
                      key={dev.atalk_addr}
                      className="border-b border-atalk-border/30 hover:bg-rose-400/5 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono">
                        <span className="text-atalk-accent font-semibold">
                          {dev.atalk_addr}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono">
                        <div className="flex items-center gap-2">
                          <DeviceIcon className="w-4 h-4 text-rose-400" />
                          <span className="text-rose-400 font-semibold">
                            {dev.object_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-atalk-text">
                        {dev.type_name}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${deviceTypeBadge(
                            dev.type_name
                          )}`}
                        >
                          {dev.device_type_cn}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-atalk-muted">
                        {dev.zone_name}
                      </td>
                      <td className="px-5 py-3 text-xs text-atalk-muted font-mono whitespace-nowrap">
                        {formatTimestamp(dev.last_seen)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recentPackets.length > 0 && (
        <div className="card-glow rounded-xl bg-atalk-surface/80 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-atalk-border">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <h3 className="text-xs font-semibold text-atalk-muted uppercase tracking-wider">
              NBP 最近数据包
            </h3>
          </div>
          <div className="font-mono text-xs">
            {recentPackets.slice().reverse().map((pkt: NbpPacketEntry, idx: number) => (
              <div
                key={`${pkt.timestamp}-${idx}`}
                className="flex items-center gap-3 px-5 py-1.5 border-b border-atalk-border/20 hover:bg-rose-400/5 transition-colors"
              >
                <span className="text-atalk-muted flex-shrink-0">
                  {formatTimestamp(pkt.timestamp)}
                </span>
                <span
                  className={`w-24 flex-shrink-0 ${
                    pkt.function_name === "LkUp-Reply"
                      ? "text-emerald-400"
                      : pkt.function_name === "LkUp"
                      ? "text-cyan-400"
                      : "text-violet-400"
                  }`}
                >
                  {pkt.function_name}
                </span>
                <span className="text-atalk-text">
                  {pkt.src_atalk_addr}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${functionStyle(
                    pkt.function_name
                  )}`}
                >
                  #{pkt.nbp_id} · {pkt.entries_count} entries
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
