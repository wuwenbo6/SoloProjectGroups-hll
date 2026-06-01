import { useSimulatorStore } from "@/store";
import { STATE_ORDER, OspfState, stateColor } from "@/types";
import { useEffect } from "react";
import { Crown, Shield, Hash } from "lucide-react";

function StateNode({
  state,
  isActive,
  isCurrent,
  x,
  y,
}: {
  state: OspfState;
  isActive: boolean;
  isCurrent: boolean;
  x: number;
  y: number;
}) {
  const color = stateColor(state);
  const radius = isCurrent ? 24 : 18;

  return (
    <g>
      {isCurrent && (
        <circle cx={x} cy={y} r={radius + 6} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4}>
          <animate attributeName="r" values={`${radius + 4};${radius + 8};${radius + 4}`} dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0.15;0.4" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={isActive ? `${color}20` : "#1A1F2E"}
        stroke={isActive ? color : "#2A3040"}
        strokeWidth={isActive ? 2 : 1}
      />
      {isActive && (
        <circle cx={x} cy={y} r={4} fill={color} className="animate-pulse-dot" />
      )}
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill={isActive ? color : "#556677"}
        fontSize={isCurrent ? 10 : 8}
        fontWeight={isCurrent ? 700 : 500}
        fontFamily="JetBrains Mono, monospace"
      >
        {state}
      </text>
    </g>
  );
}

function ArrowLine({
  fromX,
  fromY,
  toX,
  toY,
  color,
  active,
}: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  active: boolean;
}) {
  const midY = (fromY + toY) / 2;
  return (
    <g>
      <path
        d={`M ${fromX} ${fromY + 20} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY - 20}`}
        fill="none"
        stroke={active ? color : "#2A3040"}
        strokeWidth={active ? 1.5 : 0.8}
        strokeDasharray={active ? "none" : "3 3"}
        opacity={active ? 0.8 : 0.3}
      />
      {active && (
        <circle r={3} fill={color}>
          <animateMotion
            path={`M ${fromX} ${fromY + 20} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY - 20}`}
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </g>
  );
}

export default function StateMachinePanel() {
  const selectedRouter = useSimulatorStore((s) => s.selectedRouter);
  const selectedTarget = useSimulatorStore((s) => s.selectedTarget);
  const neighborStates = useSimulatorStore((s) => s.neighborStates);
  const links = useSimulatorStore((s) => s.links);
  const routerDetail = useSimulatorStore((s) => s.routerDetail);
  const sendMessage = useSimulatorStore((s) => s.sendMessage);

  useEffect(() => {
    if (selectedRouter) {
      sendMessage({ type: "select_router", routerId: selectedRouter });
    }
  }, [selectedRouter, sendMessage]);

  const currentState: OspfState = (() => {
    if (!selectedRouter || !selectedTarget) return "Down";
    const ns = neighborStates[selectedRouter];
    if (ns) {
      const targetRouter = useSimulatorStore.getState().routers.find((r) => r.id === selectedTarget);
      if (targetRouter && ns[targetRouter.routerId]) {
        return ns[targetRouter.routerId];
      }
    }
    const link = links.find(
      (l) =>
        (l.from === selectedRouter && l.to === selectedTarget) ||
        (l.from === selectedTarget && l.to === selectedRouter)
    );
    return link?.state || "Down";
  })();

  const currentNeighbor = (() => {
    if (!routerDetail || !selectedTarget) return null;
    const targetRouter = useSimulatorStore.getState().routers.find((r) => r.id === selectedTarget);
    if (!targetRouter) return null;
    return routerDetail.neighbors.find((n) => n.routerId === targetRouter.routerId) || null;
  })();

  const currentIdx = STATE_ORDER.indexOf(currentState);
  const layoutPositions = STATE_ORDER.map((_, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col === 0 ? 110 : 280;
    const y = 55 + row * 80;
    return { x, y };
  });

  const transitionPairs: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
  ];

  return (
    <div
      className="rounded-lg border border-[#2A3040] overflow-hidden"
      style={{ background: "#0F1419" }}
    >
      <div className="px-4 py-2.5 border-b border-[#2A3040] flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-widest text-[#8899AA]">
          Neighbor State Machine
        </span>
        {currentState !== "Down" && (
          <span
            className="text-xs font-mono font-semibold"
            style={{ color: stateColor(currentState) }}
          >
            {currentState}
          </span>
        )}
      </div>
      <div className="p-2">
        <svg viewBox="0 0 390 340" className="w-full">
          {transitionPairs.map(([from, to], idx) => {
            const fromPos = layoutPositions[from];
            const toPos = layoutPositions[to];
            const active = from <= currentIdx && to <= currentIdx + 1 && from <= currentIdx;
            const arrowColor = active ? stateColor(STATE_ORDER[to]) : "#2A3040";
            return (
              <ArrowLine
                key={idx}
                fromX={fromPos.x}
                fromY={fromPos.y}
                toX={toPos.x}
                toY={toPos.y}
                color={arrowColor}
                active={active}
              />
            );
          })}
          {STATE_ORDER.map((state, i) => {
            const pos = layoutPositions[i];
            return (
              <StateNode
                key={state}
                state={state}
                isActive={i <= currentIdx}
                isCurrent={i === currentIdx}
                x={pos.x}
                y={pos.y}
              />
            );
          })}
        </svg>
      </div>

      {currentNeighbor && currentState !== "Down" && (
        <div className="px-3 pb-3 border-t border-[#2A3040] pt-3 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#556677] mb-1">
            DBD Exchange
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div
              className="flex items-center gap-1.5 px-2.5 py-2 rounded"
              style={{
                background: currentNeighbor.isMaster ? "#00FF8810" : "#FFB02010",
                border: `1px solid ${currentNeighbor.isMaster ? "#00FF8830" : "#FFB02030"}`,
              }}
            >
              {currentNeighbor.isMaster ? (
                <Crown size={12} style={{ color: "#00FF88" }} />
              ) : (
                <Shield size={12} style={{ color: "#FFB020" }} />
              )}
              <div>
                <div className="text-[9px] text-[#8899AA] uppercase">Role</div>
                <div
                  className="font-mono text-xs font-semibold"
                  style={{ color: currentNeighbor.isMaster ? "#00FF88" : "#FFB020" }}
                >
                  {currentNeighbor.isMaster ? "MASTER" : "SLAVE"}
                </div>
              </div>
            </div>
            <div
              className="flex items-center gap-1.5 px-2.5 py-2 rounded"
              style={{
                background: "#00B4D810",
                border: "1px solid #00B4D830",
              }}
            >
              <Hash size={12} style={{ color: "#00B4D8" }} />
              <div>
                <div className="text-[9px] text-[#8899AA] uppercase">DD Seq</div>
                <div className="font-mono text-xs font-semibold" style={{ color: "#00B4D8" }}>
                  0x{currentNeighbor.ddSequenceNumber.toString(16).toUpperCase().padStart(8, "0")}
                </div>
              </div>
            </div>
          </div>
          {currentIdx >= 2 && (
            <div className="text-[10px] font-mono text-[#556677] text-center pt-1">
              High Router ID = Master
            </div>
          )}
        </div>
      )}

      {!selectedRouter && (
        <div className="px-4 pb-3 text-xs text-[#8899AA] text-center py-3">
          Select routers on the topology to view state machine
        </div>
      )}
    </div>
  );
}
