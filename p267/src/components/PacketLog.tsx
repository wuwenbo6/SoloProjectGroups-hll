import { useEffect, useRef } from "react";
import { useSimulatorStore } from "@/store";
import { PACKET_COLORS, OspfPacketType } from "@/types";

const LEVEL_COLORS = {
  info: "#00B4D8",
  warn: "#FFB020",
  error: "#FF4757",
};

const TYPE_BADGE_COLORS: Record<string, string> = {
  packet_sent: PACKET_COLORS.Hello,
  packet_received: PACKET_COLORS.LSU,
  state_change: "#A855F7",
  lsa_flood: "#FFB020",
  prefix_install: "#3B82F6",
};

export default function PacketLog() {
  const logs = useSimulatorStore((s) => s.logs);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      className="rounded-lg border border-[#2A3040] overflow-hidden flex flex-col"
      style={{ background: "#0A0E14" }}
    >
      <div className="px-4 py-2 border-b border-[#2A3040] flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-widest text-[#8899AA]">
          Packet Log
        </span>
        <span className="text-xs font-mono text-[#556677]">{logs.length} entries</span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-2 font-mono text-xs leading-relaxed"
        style={{ maxHeight: "220px" }}
      >
        {logs.length === 0 && (
          <div className="text-[#556677] text-center py-8">
            Waiting for events...
          </div>
        )}
        {logs.map((log) => {
          const badgeColor = log.type
            ? TYPE_BADGE_COLORS[log.type] || "#8899AA"
            : LEVEL_COLORS[log.level];
          const time = new Date(log.timestamp || Date.now());
          const timeStr = time.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          return (
            <div
              key={log.id}
              className="flex items-start gap-2 py-1 px-1 animate-fade-in hover:bg-[#1A1F2E] rounded"
            >
              <span className="text-[#556677] shrink-0">{timeStr}</span>
              {log.type && (
                <span
                  className="shrink-0 px-1.5 py-0 rounded text-[9px] font-semibold uppercase"
                  style={{
                    background: `${badgeColor}15`,
                    color: badgeColor,
                    border: `1px solid ${badgeColor}30`,
                  }}
                >
                  {log.type.replace("packet_", "").replace("state_", "st_")}
                </span>
              )}
              <span style={{ color: LEVEL_COLORS[log.level] }}>
                {log.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
