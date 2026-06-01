import { useSimulatorStore } from "@/store/useSimulatorStore";
import { CheckCircle2, XCircle, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function NodeStatusPanel() {
  const { mode, nodeStates, config } = useSimulatorStore();

  if (mode !== "multi_node_bam") {
    return null;
  }

  const nodes = config.receiverNodes;
  const hasData = Object.keys(nodeStates).length > 0;

  const getNodeColor = (nodeId: number) => {
    const colors = [
      "text-emerald-400",
      "text-blue-400",
      "text-purple-400",
      "text-pink-400",
      "text-yellow-400",
      "text-cyan-400",
      "text-orange-400",
      "text-red-400",
    ];
    return colors[nodeId % colors.length];
  };

  const getNodeBgColor = (nodeId: number) => {
    const colors = [
      "bg-emerald-500/20 border-emerald-500/30",
      "bg-blue-500/20 border-blue-500/30",
      "bg-purple-500/20 border-purple-500/30",
      "bg-pink-500/20 border-pink-500/30",
      "bg-yellow-500/20 border-yellow-500/30",
      "bg-cyan-500/20 border-cyan-500/30",
      "bg-orange-500/20 border-orange-500/30",
      "bg-red-500/20 border-red-500/30",
    ];
    return colors[nodeId % colors.length];
  };

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-emerald-400" />
        <h2 className="text-lg font-semibold text-zinc-100">接收节点状态</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {nodes.map((node) => {
          const state = nodeStates[node.node_id];
          const nodeColor = getNodeColor(node.node_id);
          const nodeBgColor = getNodeBgColor(node.node_id);

          return (
            <div
              key={node.node_id}
              className={cn(
                "p-4 rounded-lg border transition-all duration-300",
                nodeBgColor,
                state?.complete && "ring-2 ring-emerald-500/50"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                    nodeBgColor,
                    nodeColor
                  )}>
                    {node.name.charAt(node.name.length - 1)}
                  </div>
                  <div>
                    <div className={cn("font-semibold", nodeColor)}>{node.name}</div>
                    <div className="text-xs text-zinc-500 font-mono">
                      0x{node.address.toString(16).toUpperCase().padStart(2, "0")}
                    </div>
                  </div>
                </div>
                {hasData && (
                  state?.complete ? (
                    <CheckCircle2 size={20} className="text-emerald-400" />
                  ) : state ? (
                    <Clock size={20} className="text-yellow-400 animate-pulse" />
                  ) : (
                    <XCircle size={20} className="text-zinc-600" />
                  )
                )}
              </div>

              {state ? (
                <>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>接收进度</span>
                      <span className="font-mono">
                        {state.received_packets} / {state.total_packets}
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-500 rounded-full",
                          state.complete ? "bg-emerald-500" : "bg-yellow-500"
                        )}
                        style={{
                          width: `${(state.received_packets / state.total_packets) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-zinc-900/50 rounded p-2">
                      <div className="text-zinc-500">丢包</div>
                      <div className="font-mono text-red-400">
                        {state.lost_sequences?.length || 0} 帧
                      </div>
                    </div>
                    <div className="bg-zinc-900/50 rounded p-2">
                      <div className="text-zinc-500">序列号错误</div>
                      <div className="font-mono text-orange-400">
                        {state.sequence_error_count || 0} 次
                      </div>
                    </div>
                  </div>

                  {state.lost_sequences && state.lost_sequences.length > 0 && (
                    <div className="mt-3 text-xs">
                      <div className="text-zinc-500 mb-1">丢失帧:</div>
                      <div className="flex flex-wrap gap-1">
                        {state.lost_sequences.slice(0, 10).map((seq: number) => (
                          <span
                            key={seq}
                            className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded font-mono"
                          >
                            #{seq}
                          </span>
                        ))}
                        {state.lost_sequences.length > 10 && (
                          <span className="text-zinc-500">
                            +{state.lost_sequences.length - 10} 更多
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-6 text-zinc-500 text-sm">
                  等待模拟开始...
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
