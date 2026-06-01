import { useSimulatorStore } from "@/store";
import { OspfEvent } from "@/types";
import { Send, Radio, FileText, Database, RotateCcw, Play } from "lucide-react";

interface EventButton {
  event: OspfEvent;
  label: string;
  icon: React.ReactNode;
  color: string;
  group: string;
  description: string;
}

const EVENTS: EventButton[] = [
  {
    event: "send_hello",
    label: "Hello",
    icon: <Send size={14} />,
    color: "#00FF88",
    group: "Packets",
    description: "Send Hello packet",
  },
  {
    event: "send_dbd",
    label: "DBD",
    icon: <FileText size={14} />,
    color: "#A855F7",
    group: "Packets",
    description: "Send Database Description",
  },
  {
    event: "send_lsr",
    label: "LSR",
    icon: <Radio size={14} />,
    color: "#00B4D8",
    group: "Packets",
    description: "Send Link State Request",
  },
  {
    event: "send_lsu",
    label: "LSU",
    icon: <Database size={14} />,
    color: "#FFB020",
    group: "Packets",
    description: "Send Link State Update",
  },
  {
    event: "reset_neighbor",
    label: "Reset",
    icon: <RotateCcw size={14} />,
    color: "#FF4757",
    group: "Control",
    description: "Reset neighbor to Down",
  },
];

export default function EventControls() {
  const triggerEvent = useSimulatorStore((s) => s.triggerEvent);
  const selectedRouter = useSimulatorStore((s) => s.selectedRouter);
  const selectedTarget = useSimulatorStore((s) => s.selectedTarget);
  const autoDemo = useSimulatorStore((s) => s.autoDemo);
  const autoRunning = useSimulatorStore((s) => s.autoRunning);
  const resetAll = useSimulatorStore((s) => s.resetAll);
  const connected = useSimulatorStore((s) => s.connected);

  const canTrigger = connected && selectedRouter;
  const canAuto = connected && selectedRouter && selectedTarget;

  const packetGroup = EVENTS.filter((e) => e.group === "Packets");
  const controlGroup = EVENTS.filter((e) => e.group === "Control");

  return (
    <div className="rounded-lg border border-[#2A3040] overflow-hidden" style={{ background: "#0F1419" }}>
      <div className="px-4 py-2.5 border-b border-[#2A3040]">
        <span className="text-xs font-mono uppercase tracking-widest text-[#8899AA]">
          Event Controls
        </span>
      </div>
      <div className="p-3 space-y-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#556677] mb-2">
            OSPFv3 Packets
          </div>
          <div className="grid grid-cols-2 gap-2">
            {packetGroup.map((btn) => (
              <button
                key={btn.event}
                onClick={() => triggerEvent(btn.event)}
                disabled={!canTrigger}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: `${btn.color}10`,
                  color: btn.color,
                  border: `1px solid ${btn.color}25`,
                }}
                title={btn.description}
              >
                {btn.icon}
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#556677] mb-2">
            Control
          </div>
          <div className="space-y-2">
            {controlGroup.map((btn) => (
              <button
                key={btn.event}
                onClick={() => triggerEvent(btn.event)}
                disabled={!canTrigger}
                className="w-full flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: `${btn.color}10`,
                  color: btn.color,
                  border: `1px solid ${btn.color}25`,
                }}
              >
                {btn.icon}
                <span>{btn.label}</span>
              </button>
            ))}

            <button
              onClick={autoDemo}
              disabled={!canAuto || autoRunning}
              className="w-full flex items-center gap-1.5 px-3 py-2.5 rounded-md text-xs font-semibold transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: "#00FF8815",
                color: "#00FF88",
                border: "1px solid #00FF8830",
              }}
            >
              <Play size={14} />
              <span>{autoRunning ? "Running..." : "Auto Demo"}</span>
            </button>

            <button
              onClick={resetAll}
              disabled={!connected}
              className="w-full flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: "#FF475710",
                color: "#FF4757",
                border: "1px solid #FF475725",
              }}
            >
              <RotateCcw size={14} />
              <span>Reset All</span>
            </button>
          </div>
        </div>

        {!connected && (
          <div className="text-[10px] font-mono text-[#FF4757] text-center py-1">
            Backend not connected
          </div>
        )}
        {connected && !selectedRouter && (
          <div className="text-[10px] font-mono text-[#FFB020] text-center py-1">
            Select source router first
          </div>
        )}
      </div>
    </div>
  );
}
