import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import { useCaptureStore } from "@/hooks/useCaptureStore";
import type { PacketEntry } from "@/lib/api";

const PROTOCOL_COLORS: Record<string, string> = {
  RTMP: "text-atalk-warn",
  NBP: "text-cyan-400",
  ATP: "text-emerald-400",
  AEP: "text-violet-400",
  ZIP: "text-pink-400",
  ADSP: "text-blue-400",
};

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function PacketLog() {
  const packets = useCaptureStore((s) => s.packets);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [packets]);

  const reversedPackets = [...packets].reverse();

  return (
    <div className="card-glow rounded-xl bg-atalk-surface/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-atalk-border">
        <Terminal className="w-4 h-4 text-atalk-good" />
        <h2 className="text-sm font-semibold text-atalk-text">数据包日志</h2>
        <span className="ml-auto text-xs text-atalk-muted font-mono">
          {packets.length} 条记录
        </span>
      </div>

      <div
        ref={scrollRef}
        className="h-72 overflow-y-auto terminal-scroll bg-atalk-bg/50"
      >
        {reversedPackets.length === 0 ? (
          <div className="px-5 py-12 text-center text-atalk-muted text-sm">
            等待数据包...
          </div>
        ) : (
          <div className="font-mono text-xs">
            {reversedPackets.map((pkt: PacketEntry, idx: number) => {
              const protoColor =
                PROTOCOL_COLORS[pkt.protocol_name] || "text-atalk-text";
              return (
                <div
                  key={`${pkt.timestamp}-${idx}`}
                  className="flex items-center gap-3 px-4 py-1.5 border-b border-atalk-border/20 hover:bg-atalk-accent/5 transition-colors"
                >
                  <span className="text-atalk-muted flex-shrink-0">
                    {formatTimestamp(pkt.timestamp)}
                  </span>
                  <span className={`${protoColor} w-16 flex-shrink-0`}>
                    {pkt.protocol_name}
                  </span>
                  <span className="text-atalk-text">
                    {pkt.src_net}.{pkt.src_node}.{pkt.src_socket}
                  </span>
                  <span className="text-atalk-muted">→</span>
                  <span className="text-atalk-text">
                    {pkt.dst_net}.{pkt.dst_node}.{pkt.dst_socket}
                  </span>
                  <span className="text-atalk-muted ml-auto flex-shrink-0">
                    {pkt.length}B
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
