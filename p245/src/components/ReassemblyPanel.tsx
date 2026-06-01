import { useSimulatorStore } from "@/store/useSimulatorStore";
import { cn } from "@/lib/utils";
import { Check, X, RotateCcw } from "lucide-react";

export function ReassemblyPanel() {
  const {
    totalPackets,
    receivedPackets,
    missingSequences,
    reassembledMessage,
    originalMessage,
    reassemblyComplete,
    frameLogs,
  } = useSimulatorStore();

  const progress = totalPackets > 0 ? (receivedPackets / totalPackets) * 100 : 0;

  const missingSet = new Set(missingSequences);
  const originalSet = new Set(
    frameLogs
      .filter((log) => log.type === "frame_lost")
      .map((log) => (log.data as any).sequenceNumber)
  );
  const retransmittedSet = new Set(
    frameLogs
      .filter((log) => log.type === "frame_retransmit")
      .map((log) => (log.data as any).sequenceNumber)
  );

  const getPacketStatus = (seq: number) => {
    if (missingSet.has(seq)) return "missing";
    if (retransmittedSet.has(seq)) return "retransmitted";
    if (originalSet.has(seq)) return "recovered";
    if (seq <= receivedPackets || (!missingSet.has(seq) && seq <= totalPackets)) return "received";
    return "pending";
  };

  const getPacketColor = (status: string) => {
    switch (status) {
      case "received":
        return "bg-emerald-500 border-emerald-400";
      case "retransmitted":
        return "bg-orange-500 border-orange-400";
      case "recovered":
        return "bg-yellow-500 border-yellow-400";
      case "missing":
        return "bg-red-500/30 border-red-500";
      case "pending":
        return "bg-zinc-700 border-zinc-600";
      default:
        return "bg-zinc-700 border-zinc-600";
    }
  };

  const formatDataAsText = (data: number[]): string => {
    return data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  };

  const formatDataAsAscii = (data: number[]): string => {
    return data.map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ".")).join("");
  };

  return (
    <div className="h-full flex flex-col bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800">
        <h2 className="text-lg font-bold text-zinc-100" style={{ fontFamily: "'Orbitron', sans-serif" }}>
          消息重组面板
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">重组进度</span>
            <span className="text-cyan-400 font-mono">
              {receivedPackets} / {totalPackets || "-"} 帧
            </span>
          </div>
          <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500 rounded-full",
                reassemblyComplete ? "bg-gradient-to-r from-emerald-500 to-green-400" : "bg-gradient-to-r from-cyan-500 to-blue-500"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-500">
            <span>{progress.toFixed(1)}%</span>
            {missingSequences.length > 0 && (
              <span className="text-red-400">
                丢失 {missingSequences.length} 帧: #{missingSequences.join(", #")}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-300">帧状态网格</h3>
            <div className="flex gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-emerald-500" />
                <span className="text-zinc-400">正常接收</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-orange-500" />
                <span className="text-zinc-400">重传成功</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-500/30 border border-red-500" />
                <span className="text-zinc-400">丢失</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50 min-h-[100px]">
            {totalPackets === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                暂无数据
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: totalPackets }, (_, i) => {
                  const seq = i + 1;
                  const status = getPacketStatus(seq);
                  return (
                    <div
                      key={seq}
                      className={cn(
                        "w-6 h-6 rounded border flex items-center justify-center text-[9px] font-mono transition-all duration-300",
                        getPacketColor(status),
                        status === "missing" && "animate-pulse"
                      )}
                      title={`帧 #${seq} - ${status}`}
                    >
                      {status === "missing" ? (
                        <X size={10} className="text-red-400" />
                      ) : status === "retransmitted" ? (
                        <RotateCcw size={10} />
                      ) : status === "received" || status === "recovered" ? (
                        <Check size={10} />
                      ) : (
                        seq
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {reassemblyComplete && reassembledMessage.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
              <Check size={14} />
              重组完成
            </h3>

            <div className="space-y-2">
              <div>
                <div className="text-xs text-zinc-400 mb-1">原始消息 (HEX):</div>
                <div className="p-3 bg-zinc-800/80 rounded font-mono text-xs text-cyan-400 break-all max-h-24 overflow-y-auto">
                  {formatDataAsText(originalMessage)}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">重组消息 (HEX):</div>
                <div className="p-3 bg-zinc-800/80 rounded font-mono text-xs text-emerald-400 break-all max-h-24 overflow-y-auto">
                  {formatDataAsText(reassembledMessage)}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-400 mb-1">ASCII 表示:</div>
                <div className="p-3 bg-zinc-800/80 rounded font-mono text-xs text-yellow-400 break-all">
                  {formatDataAsAscii(reassembledMessage)}
                </div>
              </div>

              <div className="text-xs text-zinc-500">
                消息大小: {reassembledMessage.length} 字节
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
