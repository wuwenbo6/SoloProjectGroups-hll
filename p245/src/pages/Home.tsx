import { ControlPanel } from "@/components/ControlPanel";
import { FrameTimeline } from "@/components/FrameTimeline";
import { ReassemblyPanel } from "@/components/ReassemblyPanel";
import { ProtocolStateMachine } from "@/components/ProtocolStateMachine";
import { NodeStatusPanel } from "@/components/NodeStatusPanel";
import { useSimulatorStore } from "@/store/useSimulatorStore";

export default function Home() {
  const { mode } = useSimulatorStore();

  return (
    <div className="flex h-full w-full">
      <ControlPanel />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col gap-4 p-4 overflow-hidden">
          {mode === "multi_node_bam" && (
            <div className="flex-shrink-0">
              <NodeStatusPanel />
            </div>
          )}
          <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
            <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
              <div className="flex-1 overflow-hidden min-h-0">
                <ProtocolStateMachine />
              </div>
              <div className="flex-1 overflow-hidden min-h-0">
                <ReassemblyPanel />
              </div>
            </div>
            <div className="w-[480px] overflow-hidden min-h-0">
              <FrameTimeline />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}