import { useSimulatorStore } from "@/store/useSimulatorStore";
import { cn } from "@/lib/utils";
import { PGN_NAMES } from "@/types";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

function formatData(data: number[]): string {
  return data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    bam_announce: "BAM公告",
    rts_sent: "RTS请求",
    rts_retry: "RTS重试",
    rts_timeout: "RTS超时",
    cts_sent: "CTS应答",
    frame_sent: "帧发送",
    frame_received: "帧接收",
    frame_lost: "帧丢失",
    frame_retransmit: "帧重传",
    sequence_error: "序列号错误",
    eom_ack: "EOM确认",
    node_receive: "节点接收",
    node_progress: "节点进度",
    state_change: "状态变化",
  };
  return labels[type] || type;
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    bam_announce: "text-cyan-400 border-cyan-500/50 bg-cyan-500/10",
    rts_sent: "text-blue-400 border-blue-500/50 bg-blue-500/10",
    rts_retry: "text-orange-400 border-orange-500/50 bg-orange-500/10",
    rts_timeout: "text-red-400 border-red-500/50 bg-red-500/10",
    cts_sent: "text-yellow-400 border-yellow-500/50 bg-yellow-500/10",
    frame_sent: "text-zinc-400 border-zinc-500/50 bg-zinc-500/10",
    frame_received: "text-emerald-400 border-emerald-500/50 bg-emerald-500/10",
    frame_lost: "text-red-400 border-red-500/50 bg-red-500/10",
    frame_retransmit: "text-orange-400 border-orange-500/50 bg-orange-500/10",
    sequence_error: "text-red-500 border-red-600/50 bg-red-600/10",
    eom_ack: "text-green-400 border-green-500/50 bg-green-500/10",
    node_receive: "text-emerald-400 border-emerald-500/50 bg-emerald-500/10",
    node_progress: "text-blue-400 border-blue-500/50 bg-blue-500/10",
    state_change: "text-purple-400 border-purple-500/50 bg-purple-500/10",
  };
  return colors[type] || "text-zinc-400 border-zinc-500/50 bg-zinc-500/10";
}

export function FrameTimeline() {
  const { frameLogs } = useSimulatorStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-100" style={{ fontFamily: "'Orbitron', sans-serif" }}>
          帧传输时间线
        </h2>
        <span className="text-xs text-zinc-500 font-mono">
          {frameLogs.length} 事件
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {frameLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
            暂无帧数据，点击开始模拟
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-zinc-700" />
            {frameLogs.map((log, index) => {
              const isExpanded = expandedId === log.id;
              const data = log.data as any;
              const colorClass = getTypeColor(log.type);
              const isStateChange = log.type === "state_change";

              return (
                <div key={log.id} className="relative pl-12 pb-3">
                  <div className={cn(
                    "absolute left-3 w-4 h-4 rounded-full border-2",
                    colorClass.split(" ")[1],
                    "bg-zinc-900"
                  )}>
                    {log.type === "frame_lost" && (
                      <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
                    )}
                  </div>

                  <div
                    onClick={() => !isStateChange && toggleExpand(log.id)}
                    className={cn(
                      "p-3 rounded-lg border transition-all duration-300 cursor-pointer",
                      colorClass,
                      log.type === "frame_lost" && "animate-pulse",
                      isStateChange && "cursor-default"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-500">
                          #{index + 1}
                        </span>
                        <span className="font-semibold text-sm">
                          {getTypeLabel(log.type)}
                        </span>
                        {data.sequenceNumber !== undefined && log.type !== "state_change" && (
                          <span className="text-xs px-2 py-0.5 bg-zinc-800 rounded font-mono">
                            #{data.sequenceNumber}
                          </span>
                        )}
                      </div>
                      {!isStateChange && (
                        isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      )}
                    </div>

                    {!isStateChange && (
                      <div className="mt-2 text-xs font-mono text-zinc-400">
                        <div className="flex justify-between">
                          <span>PGN: {data.pgn ? `0x${data.pgn.toString(16).toUpperCase().padStart(4, "0")}` : "-"}</span>
                          <span>{data.pgn ? PGN_NAMES[data.pgn] || "" : ""}</span>
                        </div>
                      </div>
                    )}

                    {isStateChange && (
                      <div className="mt-2 text-xs">
                        <span className="text-zinc-400">{data.from}</span>
                        <span className="mx-2">→</span>
                        <span className="text-zinc-200 font-semibold">{data.to}</span>
                        {data.details && (
                          <div className="text-zinc-400 mt-1 text-[10px]">{data.details}</div>
                        )}
                      </div>
                    )}

                    {isExpanded && !isStateChange && (
                      <div className="mt-3 p-2 bg-zinc-900/80 rounded text-xs">
                        {log.type === "sequence_error" && (
                          <>
                            <div className="text-red-400 font-semibold mb-2">⚠️ 序列号错误</div>
                            <div className="text-zinc-400 mb-1">期望序列号: <span className="text-zinc-200">{data.expected}</span></div>
                            <div className="text-zinc-400 mb-1">实际序列号: <span className="text-red-400">{data.received}</span></div>
                            {data.node_name && (
                              <div className="text-zinc-400">节点: <span className="text-emerald-400">{data.node_name}</span></div>
                            )}
                          </>
                        )}
                        {log.type === "rts_retry" && (
                          <>
                            <div className="text-orange-400 font-semibold mb-2">🔄 RTS重试</div>
                            <div className="text-zinc-400 mb-1">重试次数: <span className="text-zinc-200">{data.retry_count}</span> / {data.max_retries}</div>
                            <div className="text-zinc-400">等待CTS超时，正在重新发送RTS...</div>
                          </>
                        )}
                        {log.type === "rts_timeout" && (
                          <>
                            <div className="text-red-400 font-semibold mb-2">⏱️ RTS超时</div>
                            <div className="text-zinc-400 mb-1">超时次数: <span className="text-zinc-200">{data.retry_count}</span> / {data.max_retries}</div>
                            <div className="text-zinc-400">等待CTS超时，已达到最大重试次数</div>
                          </>
                        )}
                        {log.type === "node_receive" && (
                          <>
                            <div className="text-emerald-400 font-semibold mb-2">📥 节点接收</div>
                            <div className="text-zinc-400 mb-1">节点: <span className="text-emerald-400">{data.node_name}</span></div>
                            <div className="text-zinc-400 mb-1">节点地址: <span className="text-zinc-200 font-mono">0x{data.node_address?.toString(16).toUpperCase().padStart(2, "0")}</span></div>
                            <div className="text-zinc-400 mb-1">序列号: <span className="text-zinc-200">#{data.sequence_number}</span></div>
                            {data.sequence_valid === false && (
                              <div className="text-red-400 mt-1">⚠️ 序列号无效</div>
                            )}
                          </>
                        )}
                        {data.data && log.type !== "sequence_error" && log.type !== "rts_retry" && log.type !== "rts_timeout" && log.type !== "node_receive" && (
                          <>
                            <div className="text-zinc-500 mb-1">帧数据 (HEX):</div>
                            <div className="font-mono break-all text-cyan-400">
                              {formatData(data.data)}
                            </div>
                            {data.payload_data && (
                              <>
                                <div className="text-zinc-500 mt-2 mb-1">有效载荷:</div>
                                <div className="font-mono break-all text-emerald-400">
                                  {formatData(data.payload_data)}
                                </div>
                              </>
                            )}
                            {data.can_id !== undefined && (
                              <div className="text-zinc-500 mt-2">
                                CAN ID: <span className="text-yellow-400">0x{data.can_id.toString(16).toUpperCase().padStart(8, "0")}</span>
                              </div>
                            )}
                          </>
                        )}
                        <div className="text-zinc-500 mt-2">
                          时间戳: <span className="text-zinc-300">{new Date(log.timestamp).toLocaleTimeString()}.{String(Math.floor(log.timestamp % 1000)).padStart(3, "0")}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
