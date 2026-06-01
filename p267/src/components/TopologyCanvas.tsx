import { useSimulatorStore, PacketAnimation } from "@/store";
import { RouterInfo, LinkInfo, OspfState, stateColor } from "@/types";
import { useEffect, useRef, useMemo } from "react";

const ROUTER_RADIUS = 36;

function getRouterPosition(routers: RouterInfo[], id: string): { x: number; y: number } {
  const r = routers.find((r) => r.id === id);
  if (!r) return { x: 0, y: 0 };
  return { x: r.x, y: r.y };
}

function RouterNode({
  router,
  isSelected,
  isTarget,
  onClick,
}: {
  router: RouterInfo;
  isSelected: boolean;
  isTarget: boolean;
  onClick: () => void;
}) {
  const strokeColor = isSelected ? "#00FF88" : isTarget ? "#FFB020" : "#2A3040";
  const glowClass = isSelected ? "glow-green" : isTarget ? "glow-amber" : "";

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <circle
        cx={router.x}
        cy={router.y}
        r={ROUTER_RADIUS + 4}
        fill="none"
        stroke={strokeColor}
        strokeWidth={isSelected || isTarget ? 2 : 0}
        className={glowClass}
        opacity={0.6}
      />
      <circle
        cx={router.x}
        cy={router.y}
        r={ROUTER_RADIUS}
        fill="#1A1F2E"
        stroke={strokeColor}
        strokeWidth={2}
      />
      <text
        x={router.x}
        y={router.y - 6}
        textAnchor="middle"
        fill="#E8ECF1"
        fontSize={14}
        fontWeight={600}
        fontFamily="DM Sans, sans-serif"
      >
        {router.name}
      </text>
      <text
        x={router.x}
        y={router.y + 12}
        textAnchor="middle"
        fill="#8899AA"
        fontSize={9}
        fontFamily="JetBrains Mono, monospace"
      >
        {router.routerId}
      </text>
      {isSelected && (
        <circle
          cx={router.x}
          cy={router.y - ROUTER_RADIUS - 10}
          r={4}
          fill="#00FF88"
          className="animate-pulse-dot"
        />
      )}
      {isTarget && (
        <circle
          cx={router.x}
          cy={router.y - ROUTER_RADIUS - 10}
          r={4}
          fill="#FFB020"
          className="animate-pulse-dot"
        />
      )}
    </g>
  );
}

function LinkLine({ link, routers }: { link: LinkInfo; routers: RouterInfo[] }) {
  const from = getRouterPosition(routers, link.from);
  const to = getRouterPosition(routers, link.to);
  const color = stateColor(link.state);
  const isActive = link.state !== "Down";

  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={isActive ? color : "#2A3040"}
        strokeWidth={isActive ? 2.5 : 1}
        strokeDasharray={isActive ? "none" : "6 4"}
        opacity={isActive ? 0.7 : 0.3}
      />
      {isActive && (
        <text
          x={(from.x + to.x) / 2}
          y={(from.y + to.y) / 2 - 8}
          textAnchor="middle"
          fill={color}
          fontSize={10}
          fontWeight={600}
          fontFamily="JetBrains Mono, monospace"
          style={{ textShadow: `0 0 8px ${color}40` }}
        >
          {link.state}
        </text>
      )}
    </g>
  );
}

function PacketDot({ anim, routers }: { anim: PacketAnimation; routers: RouterInfo[] }) {
  const fromR = routers.find((r) => r.routerId === anim.from || r.id === anim.from);
  const toR = routers.find((r) => r.routerId === anim.to || r.id === anim.to);
  if (!fromR || !toR) return null;

  return (
    <circle r={5} fill={anim.color} opacity={0.9}>
      <animate
        attributeName="cx"
        from={fromR.x}
        to={toR.x}
        dur="1s"
        fill="freeze"
      />
      <animate
        attributeName="cy"
        from={fromR.y}
        to={toR.y}
        dur="1s"
        fill="freeze"
      />
      <animate
        attributeName="opacity"
        values="0;1;1;0"
        keyTimes="0;0.1;0.8;1"
        dur="1s"
        fill="freeze"
      />
    </circle>
  );
}

export default function TopologyCanvas() {
  const routers = useSimulatorStore((s) => s.routers);
  const links = useSimulatorStore((s) => s.links);
  const selectedRouter = useSimulatorStore((s) => s.selectedRouter);
  const selectedTarget = useSimulatorStore((s) => s.selectedTarget);
  const packetAnimations = useSimulatorStore((s) => s.packetAnimations);
  const selectRouter = useSimulatorStore((s) => s.selectRouter);
  const selectTarget = useSimulatorStore((s) => s.selectTarget);
  const sendMessage = useSimulatorStore((s) => s.sendMessage);
  const svgRef = useRef<SVGSVGElement>(null);

  const viewBox = useMemo(() => {
    if (routers.length === 0) return "0 0 800 600";
    const padding = 80;
    const minX = Math.min(...routers.map((r) => r.x)) - padding;
    const minY = Math.min(...routers.map((r) => r.y)) - padding;
    const maxX = Math.max(...routers.map((r) => r.x)) + padding;
    const maxY = Math.max(...routers.map((r) => r.y)) + padding;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [routers]);

  useEffect(() => {
    if (routers.length === 0) return;
    const initStates: Record<string, Record<string, OspfState>> = {};
    for (const r of routers) {
      initStates[r.id] = {};
      for (const l of links) {
        if (l.from === r.id) {
          initStates[r.id][l.to] = l.state;
        }
        if (l.to === r.id) {
          initStates[r.id][l.from] = l.state;
        }
      }
    }
  }, [routers, links]);

  const handleClick = (routerId: string) => {
    if (!selectedRouter) {
      selectRouter(routerId);
      sendMessage({ type: "select_router", routerId });
    } else if (!selectedTarget && routerId !== selectedRouter) {
      selectTarget(routerId);
    } else if (routerId === selectedRouter) {
      selectRouter(null);
      selectTarget(null);
    } else if (routerId === selectedTarget) {
      selectTarget(null);
    } else {
      selectTarget(routerId);
    }
  };

  return (
    <div className="relative w-full h-full scanline rounded-lg overflow-hidden" style={{ background: "#0A0E14" }}>
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
        <span className="text-xs font-mono text-[#8899AA] uppercase tracking-widest">Topology</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[#00FF88] animate-pulse-dot" />
      </div>

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {links.map((link, i) => (
          <LinkLine key={i} link={link} routers={routers} />
        ))}

        {packetAnimations.map((anim) => (
          <PacketDot key={anim.id} anim={anim} routers={routers} />
        ))}

        {routers.map((router) => (
          <RouterNode
            key={router.id}
            router={router}
            isSelected={selectedRouter === router.id}
            isTarget={selectedTarget === router.id}
            onClick={() => handleClick(router.id)}
          />
        ))}
      </svg>

      <div className="absolute bottom-3 right-4 text-xs font-mono text-[#8899AA]">
        {selectedRouter ? (
          <span>
            Source: <span className="text-[#00FF88]">{selectedRouter.toUpperCase()}</span>
            {selectedTarget && (
              <>
                {" → "}
                Target: <span className="text-[#FFB020]">{selectedTarget.toUpperCase()}</span>
              </>
            )}
          </span>
        ) : (
          <span>Click a router to select source</span>
        )}
      </div>
    </div>
  );
}
