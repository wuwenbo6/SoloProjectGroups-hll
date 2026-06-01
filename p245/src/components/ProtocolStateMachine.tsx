import { useSimulatorStore } from "@/store/useSimulatorStore";
import { cn } from "@/lib/utils";
import { Radio, Handshake, Send, ArrowRight, Check } from "lucide-react";

interface StateNode {
  id: string;
  label: string;
  icon: typeof Radio;
  color: string;
}

const bamStates: StateNode[] = [
  { id: "idle", label: "空闲", icon: Radio, color: "text-zinc-400" },
  { id: "transmitting", label: "广播传输", icon: Send, color: "text-cyan-400" },
  { id: "complete", label: "传输完成", icon: Check, color: "text-emerald-400" },
];

const cmdtStates: StateNode[] = [
  { id: "idle", label: "空闲", icon: Radio, color: "text-zinc-400" },
  { id: "waiting_cts", label: "等待CTS", icon: Handshake, color: "text-yellow-400" },
  { id: "transmitting", label: "数据传输", icon: Send, color: "text-cyan-400" },
  { id: "retransmitting", label: "帧重传", icon: Send, color: "text-orange-400" },
  { id: "waiting_ack", label: "等待确认", icon: Handshake, color: "text-purple-400" },
  { id: "complete", label: "传输完成", icon: Check, color: "text-emerald-400" },
];

export function ProtocolStateMachine() {
  const { mode, state } = useSimulatorStore();
  const states = mode === "bam" ? bamStates : cmdtStates;

  const currentIndex = states.findIndex((s) => s.id === state);
  const activeIndex = currentIndex >= 0 ? currentIndex : 0;

  return (
    <div className="h-full flex flex-col bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800">
        <h2 className="text-lg font-bold text-zinc-100" style={{ fontFamily: "'Orbitron', sans-serif" }}>
          协议状态机
        </h2>
      </div>

      <div className="flex-1 p-5">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {states.map((node, index) => {
            const Icon = node.icon;
            const isActive = index <= activeIndex;
            const isCurrent = index === activeIndex;

            return (
              <div key={node.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all duration-500 min-w-[100px]",
                    isActive
                      ? cn(
                          "border-current bg-current/10 shadow-lg",
                          isCurrent && "scale-110",
                          node.color
                        )
                      : "border-zinc-700 bg-zinc-800/30 text-zinc-600"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500",
                    isActive ? "bg-current/20" : "bg-zinc-700/50",
                    isCurrent && "animate-pulse"
                  )}>
                    <Icon size={24} />
                  </div>
                  <span className={cn(
                    "text-xs font-semibold",
                    isActive ? "" : "text-zinc-600"
                  )}>
                    {node.label}
                  </span>
                </div>

                {index < states.length - 1 && (
                  <ArrowRight
                    size={20}
                    className={cn(
                      "transition-all duration-500",
                      index < activeIndex ? "text-emerald-400" : "text-zinc-700"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {mode === "cmdt" && (
          <div className="mt-8 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">CMDT握手流程</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-20 text-blue-400 font-mono">RTS</span>
                <ArrowRight size={14} className="text-zinc-500" />
                <span className="text-zinc-400">请求发送：通知接收端准备接收大消息</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-yellow-400 font-mono">CTS</span>
                <ArrowRight size={14} className="text-zinc-500" />
                <span className="text-zinc-400">清除发送：接收端同意接收，指定窗口大小</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-cyan-400 font-mono">DT</span>
                <ArrowRight size={14} className="text-zinc-500" />
                <span className="text-zinc-400">数据传输：按窗口发送数据帧</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-orange-400 font-mono">CTS(Retry)</span>
                <ArrowRight size={14} className="text-zinc-500" />
                <span className="text-zinc-400">请求重传：检测到丢包，请求重传指定帧</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-emerald-400 font-mono">EndOfMsgAck</span>
                <ArrowRight size={14} className="text-zinc-500" />
                <span className="text-zinc-400">结束确认：全部接收完成，发送确认</span>
              </div>
            </div>
          </div>
        )}

        {mode === "bam" && (
          <div className="mt-8 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">BAM广播流程</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-32 text-cyan-400 font-mono">BAM Announce</span>
                <ArrowRight size={14} className="text-zinc-500" />
                <span className="text-zinc-400">广播公告：通知所有节点即将发送大消息</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-32 text-blue-400 font-mono">DT Frames</span>
                <ArrowRight size={14} className="text-zinc-500" />
                <span className="text-zinc-400">数据帧广播：连续广播所有数据帧，无确认</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-32 text-orange-400 font-mono">无重传</span>
                <ArrowRight size={14} className="text-zinc-500" />
                <span className="text-zinc-400">BAM为不可靠传输，丢包不重传</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
