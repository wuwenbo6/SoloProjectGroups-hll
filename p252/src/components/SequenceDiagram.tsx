import { useRef, useEffect, useState, useCallback } from "react";
import type { EapMessage, TlsPhase, RadiusMessage } from "@/types/eapol";
import { cn } from "@/lib/utils";

interface Props {
  messages: EapMessage[];
  radiusMessages: RadiusMessage[];
  tlsPhases: TlsPhase[];
  selectedId: number | null;
  showRadius: boolean;
  onSelect: (msg: EapMessage) => void;
}

const LANES_EAP = ["Supplicant", "Authenticator", "Server"] as const;
const LANES_RADIUS = ["Supplicant", "Authenticator", "RADIUS Server"] as const;
const LANE_WIDTH = 240;
const LANE_MARGIN = 40;
const MSG_HEIGHT = 52;
const HEADER_HEIGHT = 56;
const ARROW_OFFSET = 60;

type CombinedRow =
  | { kind: "eap"; msg: EapMessage }
  | { kind: "radius"; msg: RadiusMessage };

function getLaneIndex(direction: string, showRadius: boolean): [number, number] {
  if (showRadius) {
    switch (direction) {
      case "supplicant_to_auth":
        return [0, 1];
      case "auth_to_supplicant":
        return [1, 0];
      case "auth_to_server":
        return [1, 2];
      case "server_to_auth":
        return [2, 1];
      default:
        return [0, 1];
    }
  } else {
    switch (direction) {
      case "supplicant_to_auth":
        return [0, 1];
      case "auth_to_supplicant":
        return [1, 0];
      case "auth_to_server":
        return [1, 2];
      case "server_to_auth":
        return [2, 1];
      default:
        return [0, 1];
    }
  }
}

function getPhaseColor(name: string): string {
  switch (name) {
    case "ClientHello":
      return "rgba(0, 229, 204, 0.08)";
    case "ServerHello":
      return "rgba(99, 102, 241, 0.08)";
    case "KeyExchange":
      return "rgba(245, 158, 11, 0.08)";
    case "Finished":
      return "rgba(34, 197, 94, 0.08)";
    case "TLSData":
      return "rgba(168, 85, 247, 0.06)";
    case "TLSHandshake":
      return "rgba(245, 158, 11, 0.06)";
    case "TLSFragment":
      return "rgba(251, 146, 60, 0.05)";
    default:
      return "rgba(100, 116, 139, 0.06)";
  }
}

function getPhaseBorderColor(name: string): string {
  switch (name) {
    case "ClientHello":
      return "rgba(0, 229, 204, 0.3)";
    case "ServerHello":
      return "rgba(99, 102, 241, 0.3)";
    case "KeyExchange":
      return "rgba(245, 158, 11, 0.3)";
    case "Finished":
      return "rgba(34, 197, 94, 0.3)";
    case "TLSFragment":
      return "rgba(251, 146, 60, 0.2)";
    default:
      return "rgba(100, 116, 139, 0.2)";
  }
}

function getCodeColor(code: string): string {
  switch (code) {
    case "Request":
      return "#818cf8";
    case "Response":
      return "#00e5cc";
    case "Success":
      return "#22c55e";
    case "Failure":
      return "#ef4444";
    case "Start":
      return "#f59e0b";
    case "Logoff":
      return "#f97316";
    case "Access-Request":
      return "#c084fc";
    case "Access-Challenge":
      return "#a78bfa";
    case "Access-Accept":
      return "#4ade80";
    case "Access-Reject":
      return "#f87171";
    default:
      return "#94a3b8";
  }
}

function getRadiusCodeColor(code: string): string {
  switch (code) {
    case "Access-Request":
      return "#c084fc";
    case "Access-Challenge":
      return "#a78bfa";
    case "Access-Accept":
      return "#4ade80";
    case "Access-Reject":
      return "#f87171";
    default:
      return "#94a3b8";
  }
}

function getFragmentLabel(frag: EapMessage["fragmentInfo"]): string | null {
  if (!frag) return null;
  if (frag.isFragment) {
    if (frag.moreFragments) return `Frag ${frag.fragmentSequence}→`;
    if (frag.totalFragments > 0) return `Frag ${frag.fragmentSequence}/${frag.totalFragments}`;
    return `Frag ${frag.fragmentSequence}`;
  }
  if (frag.moreFragments && frag.fragmentSequence === 0) return "Frag 1→";
  return null;
}

function mergeRows(messages: EapMessage[], radiusMessages: RadiusMessage[]): CombinedRow[] {
  const rows: CombinedRow[] = [];
  let mi = 0;
  let ri = 0;

  while (mi < messages.length && ri < radiusMessages.length) {
    const mTime = messages[mi].timestamp;
    const rTime = radiusMessages[ri].timestamp;

    const rBeforeEap = radiusMessages[ri].radiusCode === "Access-Challenge" ||
                       radiusMessages[ri].radiusCode === "Access-Accept" ||
                       radiusMessages[ri].radiusCode === "Access-Reject";

    if (rBeforeEap && rTime <= mTime + 0.002) {
      rows.push({ kind: "radius", msg: radiusMessages[ri] });
      ri++;
    } else if (mTime <= rTime) {
      rows.push({ kind: "eap", msg: messages[mi] });
      mi++;
    } else {
      rows.push({ kind: "radius", msg: radiusMessages[ri] });
      ri++;
    }
  }

  while (mi < messages.length) {
    rows.push({ kind: "eap", msg: messages[mi] });
    mi++;
  }
  while (ri < radiusMessages.length) {
    rows.push({ kind: "radius", msg: radiusMessages[ri] });
    ri++;
  }

  return rows;
}

export default function SequenceDiagram({
  messages,
  radiusMessages,
  tlsPhases,
  selectedId,
  showRadius,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const lanes = showRadius && radiusMessages.length > 0 ? LANES_RADIUS : LANES_EAP;
  const laneCount = lanes.length;
  const totalWidth = laneCount * LANE_WIDTH + (laneCount - 1) * LANE_MARGIN;

  const rows = showRadius ? mergeRows(messages, radiusMessages) : messages.map((m) => ({ kind: "eap" as const, msg: m }));
  const totalHeight = HEADER_HEIGHT + rows.length * MSG_HEIGHT + 40;

  const getLaneX = useCallback(
    (idx: number) => idx * (LANE_WIDTH + LANE_MARGIN) + LANE_WIDTH / 2,
    []
  );

  const getRowY = useCallback(
    (idx: number) => HEADER_HEIGHT + idx * MSG_HEIGHT + ARROW_OFFSET / 2,
    []
  );

  useEffect(() => {
    if (selectedId !== null && containerRef.current) {
      const rowIdx = rows.findIndex((r) => r.kind === "eap" && r.msg.id === selectedId);
      if (rowIdx >= 0) {
        const y = HEADER_HEIGHT + rowIdx * MSG_HEIGHT;
        containerRef.current.scrollTo({
          top: y - 100,
          behavior: "smooth",
        });
      }
    }
  }, [selectedId, rows]);

  const phaseRanges: Map<number, { phase: TlsPhase; rowStart: number; rowEnd: number }> = new Map();
  tlsPhases.forEach((phase) => {
    const startIdx = messages.findIndex((m) => m.id === phase.startMessageId);
    const endIdx = messages.findIndex((m) => m.id === phase.endMessageId);
    if (startIdx >= 0) {
      const rowStart = rows.findIndex((r) => r.kind === "eap" && r.msg.id === phase.startMessageId);
      const rowEnd = rows.findIndex((r) => r.kind === "eap" && r.msg.id === phase.endMessageId);
      if (rowStart >= 0) {
        phaseRanges.set(rowStart, {
          phase,
          rowStart,
          rowEnd: rowEnd >= 0 ? rowEnd : rowStart,
        });
      }
    }
  });

  return (
    <div
      ref={containerRef}
      className="overflow-auto flex-1 rounded-xl border border-slate-700/50 bg-[#0d1b2a]"
    >
      <svg
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        className="min-w-full"
      >
        <defs>
          <marker id="arrowRight" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
          </marker>
          <marker id="arrowLeft" viewBox="0 0 10 7" refX="0" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="10 0, 0 3.5, 10 7" fill="#64748b" />
          </marker>
          <marker id="arrowRightSel" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#00e5cc" />
          </marker>
          <marker id="arrowLeftSel" viewBox="0 0 10 7" refX="0" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="10 0, 0 3.5, 10 7" fill="#00e5cc" />
          </marker>
          <marker id="arrowRightFrag" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#fb923c" />
          </marker>
          <marker id="arrowLeftFrag" viewBox="0 0 10 7" refX="0" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="10 0, 0 3.5, 10 7" fill="#fb923c" />
          </marker>
          <marker id="arrowRightRad" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#c084fc" />
          </marker>
          <marker id="arrowLeftRad" viewBox="0 0 10 7" refX="0" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
            <polygon points="10 0, 0 3.5, 10 7" fill="#c084fc" />
          </marker>
        </defs>

        {lanes.map((name, idx) => {
          const x = getLaneX(idx);
          return (
            <g key={name}>
              <rect
                x={x - LANE_WIDTH / 2} y={0}
                width={LANE_WIDTH} height={HEADER_HEIGHT - 8}
                rx={6} fill="#1a2332" stroke="#2d3a4a" strokeWidth={1}
              />
              <text
                x={x} y={HEADER_HEIGHT / 2 - 4}
                textAnchor="middle" dominantBaseline="central"
                fill={name.includes("RADIUS") ? "#c084fc" : "#e2e8f0"}
                fontSize={name.includes("RADIUS") ? 11 : 13}
                fontFamily="'JetBrains Mono', monospace"
                fontWeight={600}
              >
                {name}
              </text>
              <line
                x1={x} y1={HEADER_HEIGHT}
                x2={x} y2={totalHeight - 20}
                stroke={name.includes("RADIUS") ? "#6d28d9" : "#2d3a4a"}
                strokeWidth={name.includes("RADIUS") ? 1 : 1.5}
                strokeDasharray="6 4"
              />
            </g>
          );
        })}

        {Array.from(phaseRanges.entries()).map(([key, { phase, rowStart, rowEnd }]) => {
          const yStart = HEADER_HEIGHT + rowStart * MSG_HEIGHT - 4;
          const yEnd = HEADER_HEIGHT + (rowEnd + 1) * MSG_HEIGHT + 4;
          return (
            <g key={key}>
              <rect x={4} y={yStart} width={totalWidth - 8} height={yEnd - yStart} rx={4}
                fill={getPhaseColor(phase.name)} stroke={getPhaseBorderColor(phase.name)} strokeWidth={1}
              />
              <text x={12} y={yStart + 14}
                fill={getPhaseBorderColor(phase.name).replace("0.3", "0.8").replace("0.2", "0.7")}
                fontSize={10} fontFamily="'JetBrains Mono', monospace" fontWeight={500}
              >
                {phase.name}
              </text>
            </g>
          );
        })}

        {rows.map((row, idx) => {
          const y = getRowY(idx);

          if (row.kind === "radius") {
            const rMsg = row.msg;
            const [fromLane, toLane] = getLaneIndex(rMsg.direction, true);
            const x1 = getLaneX(fromLane);
            const x2 = getLaneX(toLane);
            const isRight = x2 > x1;
            const labelX = (x1 + x2) / 2;
            const rColor = getRadiusCodeColor(rMsg.radiusCode);
            const hKey = `r-${rMsg.id}`;
            const isHovered = hoveredId === hKey;

            return (
              <g key={hKey} opacity={0.7}>
                <line x1={x1} y1={y} x2={x2} y2={y}
                  stroke={isHovered ? rColor : "#c084fc60"}
                  strokeWidth={isHovered ? 1.5 : 1}
                  strokeDasharray="3 2"
                  markerEnd={isRight ? "url(#arrowRightRad)" : undefined}
                  markerStart={!isRight ? "url(#arrowLeftRad)" : undefined}
                />
                <text x={labelX} y={y - 6} textAnchor="middle"
                  fill={rColor} fontSize={9}
                  fontFamily="'JetBrains Mono', monospace" fontWeight={500}
                >
                  {rMsg.radiusCode}
                </text>
                <text x={labelX} y={y + 9} textAnchor="middle"
                  fill="#7c3aed80" fontSize={8}
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {rMsg.radiusAttributes["EAP-Message"] || ""}
                </text>
              </g>
            );
          }

          const msg = row.msg;
          const [fromLane, toLane] = getLaneIndex(msg.direction, showRadius);
          const x1 = getLaneX(fromLane);
          const x2 = getLaneX(toLane);
          const isSelected = selectedId === msg.id;
          const isHovered = hoveredId === `e-${msg.id}`;
          const isRight = x2 > x1;
          const isFragment = msg.tlsPhase === "TLSFragment" || (msg.fragmentInfo?.moreFragments ?? false);
          const fragLabel = getFragmentLabel(msg.fragmentInfo);

          const labelX = (x1 + x2) / 2;
          const codeColor = getCodeColor(msg.eapCode);

          let lineColor = "#475569";
          let rightMarker: string | undefined = "url(#arrowRight)";
          let leftMarker: string | undefined = undefined;

          if (isSelected) {
            lineColor = "#00e5cc";
            rightMarker = "url(#arrowRightSel)";
            leftMarker = isRight ? undefined : "url(#arrowLeftSel)";
          } else if (isHovered) {
            lineColor = "#818cf8";
          } else if (isFragment) {
            lineColor = "#fb923c80";
            rightMarker = "url(#arrowRightFrag)";
            leftMarker = isRight ? undefined : "url(#arrowLeftFrag)";
          }

          return (
            <g
              key={`e-${msg.id}`}
              className={cn(
                "cursor-pointer transition-all duration-150",
                isSelected && "opacity-100",
                !isSelected && selectedId !== null && "opacity-50"
              )}
              onClick={() => onSelect(msg)}
              onMouseEnter={() => setHoveredId(`e-${msg.id}`)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <rect x={Math.min(x1, x2) - 2} y={y - 18}
                width={Math.abs(x2 - x1) + 4} height={36} fill="transparent"
              />

              <line x1={x1} y1={y} x2={x2} y2={y}
                stroke={lineColor}
                strokeWidth={isSelected || isHovered ? 2 : isFragment ? 1 : 1.5}
                strokeDasharray={isFragment && !isSelected && !isHovered ? "4 3" : undefined}
                markerEnd={isRight ? rightMarker : undefined}
                markerStart={!isRight ? leftMarker : undefined}
              />

              {msg.eapCode === "Success" || msg.eapCode === "Failure" ? (
                <circle cx={x1} cy={y} r={8}
                  fill={msg.eapCode === "Success" ? "#22c55e" : "#ef4444"}
                  fillOpacity={0.2}
                  stroke={msg.eapCode === "Success" ? "#22c55e" : "#ef4444"}
                  strokeWidth={1.5}
                />
              ) : null}

              <text x={labelX} y={y - 6} textAnchor="middle"
                fill={isFragment && !isSelected ? "#fb923c" : codeColor}
                fontSize={10} fontFamily="'JetBrains Mono', monospace" fontWeight={600}
              >
                {msg.eapCode}
              </text>
              <text x={labelX} y={y + 10} textAnchor="middle"
                fill="#94a3b8" fontSize={9} fontFamily="'JetBrains Mono', monospace"
              >
                {msg.eapType}
                {msg.md5Info ? ` [${msg.md5Info.role}]` : ""}
                {fragLabel ? ` [${fragLabel}]` : ""}
                {msg.tlsPhase && msg.tlsPhase !== "TLSFragment" ? ` [${msg.tlsPhase}]` : ""}
              </text>

              {msg.fragmentInfo?.reassembledData && (
                <circle cx={Math.min(x1, x2) + 6} cy={y - 14} r={4} fill="#22c55e" fillOpacity={0.6} />
              )}

              <text x={totalWidth - 12} y={y + 4} textAnchor="end"
                fill="#475569" fontSize={8} fontFamily="'JetBrains Mono', monospace"
              >
                #{msg.frameNumber}
              </text>
            </g>
          );
        })}

        <text x={totalWidth / 2} y={totalHeight - 6} textAnchor="middle"
          fill="#334155" fontSize={9} fontFamily="'JetBrains Mono', monospace"
        >
          EAPoL Message Sequence {showRadius && radiusMessages.length > 0 ? "(+ RADIUS)" : ""}
        </text>
      </svg>
    </div>
  );
}
