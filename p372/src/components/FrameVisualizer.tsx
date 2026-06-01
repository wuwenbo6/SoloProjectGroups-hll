import { useOTNStore } from "@/store/otnStore";
import type { FrameZone, JustificationInfo } from "@/types/otn";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

const ZONE_COLORS: Record<string, string> = {
  FAS: "#FF4444",
  MFAS: "#FF8844",
  "ODUk OH": "#4488FF",
  "OPUk OH": "#44CC88",
  Payload: "#1A3A5C",
  FEC: "#8844CC",
};

const ZONE_HOVER_COLORS: Record<string, string> = {
  FAS: "#FF6666",
  MFAS: "#FFaa66",
  "ODUk OH": "#66aaff",
  "OPUk OH": "#66eeaa",
  Payload: "#2A5A8C",
  FEC: "#aa66ee",
};

interface ZoneInfo {
  name: string;
  startCol: number;
  endCol: number;
  widthPercent: number;
  color: string;
  hoverColor: string;
}

export default function FrameVisualizer() {
  const state = useOTNStore((s) => s.state);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<number>(0);

  const zones: ZoneInfo[] = useMemo(() => {
    if (!state?.frame?.zones) return [];
    const totalCols = state.frame.columns;
    return state.frame.zones.map((z: FrameZone) => ({
      name: z.name,
      startCol: z.start_col,
      endCol: z.end_col,
      widthPercent: ((z.end_col - z.start_col + 1) / totalCols) * 100,
      color: ZONE_COLORS[z.name] || z.color,
      hoverColor: ZONE_HOVER_COLORS[z.name] || z.color,
    }));
  }, [state?.frame?.zones, state?.frame?.columns]);

  const timeslotSegments = useMemo(() => {
    if (!state) return [];
    const numTs = state.frame.numTimeslots;
    const payloadZone = zones.find((z) => z.name === "Payload");
    if (!payloadZone) return [];
    const tsWidth = payloadZone.widthPercent / numTs;
    const processed = new Set<number>();
    const segments: any[] = [];

    for (const ts of state.timeslots) {
      if (processed.has(ts.index)) continue;
      if (!ts.isLead && ts.occupied) {
        processed.add(ts.index);
        continue;
      }

      const tsCount = ts.occupied && ts.odu0Id
        ? state.timeslots.filter(t => t.odu0Id === ts.odu0Id).length
        : 1;

      const tsIndices: number[] = [];
      for (let i = 0; i < tsCount; i++) {
        const idx = ts.index + i;
        if (idx <= numTs) {
          tsIndices.push(idx);
          processed.add(idx);
        }
      }

      const just: JustificationInfo | undefined = state.justification[String(ts.index)];
      const hasLck = tsIndices.some(idx => {
        const t = state.timeslots.find(t => t.index === idx);
        return t?.lck;
      });

      segments.push({
        ...ts,
        index: tsIndices[0],
        tsIndices,
        tsCount,
        leftPercent: payloadZone.startCol / (state.frame.columns) * 100 + (tsIndices[0] - 1) * tsWidth,
        widthPercent: tsWidth * tsCount,
        color: hasLck ? "#FF4444" : ts.occupied ? (ts.signalType === "ODUflex" ? "#A855F7" : "#FFB800") : "#0A2A4A",
        borderColor: hasLck ? "#FF6666" : ts.occupied ? (ts.signalType === "ODUflex" ? "#C084FC" : "#FFD466") : "#1A4A6A",
        justType: just?.justType || "none",
        hasLck,
        signalType: ts.signalType,
      });
    }
    return segments.sort((a, b) => a.index - b.index);
  }, [state, zones]);

  const hasAnyJustification = state && Object.keys(state.justification).length > 0;
  const hasAnyAlarm = state && state.alarms.some((a) => a.active);

  if (!state) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-cyan-300 tracking-wider uppercase">
          {state.oduType} 帧结构 ({state.frame.rows}×{state.frame.columns})
        </h3>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>速率: {state.frame.bitrateGbps.toFixed(3)} Gbps</span>
          <span className="text-slate-600">|</span>
          <span>时隙数: {state.frame.numTimeslots}</span>
          {hasAnyJustification && (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-400">JC调整中</span>
            </>
          )}
          {hasAnyAlarm && (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-red-400 animate-pulse">⚠ 告警</span>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-1">
        {Array.from({ length: state.frame.rows }, (_, i) => (
          <button
            key={i}
            onClick={() => setSelectedRow(i)}
            className={`px-3 py-1 text-xs rounded transition-all duration-200 ${
              selectedRow === i
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_8px_rgba(0,212,255,0.3)]"
                : "bg-slate-800/50 text-slate-500 border border-slate-700/50 hover:text-slate-300"
            }`}
          >
            行 {i + 1}
          </button>
        ))}
      </div>

      <div className="relative h-16 rounded-lg overflow-hidden border border-slate-700/50 bg-[#060E1A]">
        <svg width="100%" height="100%" preserveAspectRatio="none" className="absolute inset-0">
          {zones.map((zone) => {
            const x = ((zone.startCol - 1) / state.frame.columns) * 100;
            const isOpukOh = zone.name === "OPUk OH";
            const hasJc = isOpukOh && hasAnyJustification;
            return (
              <g key={zone.name}>
                <rect
                  x={`${x}%`}
                  y="0"
                  width={`${zone.widthPercent}%`}
                  height="100%"
                  fill={hoveredZone === zone.name ? zone.hoverColor : zone.color}
                  opacity={0.85}
                  className="transition-all duration-300 cursor-pointer"
                  onMouseEnter={() => setHoveredZone(zone.name)}
                  onMouseLeave={() => setHoveredZone(null)}
                />
                {zone.widthPercent > 4 && (
                  <text
                    x={`${x + zone.widthPercent / 2}%`}
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    opacity={0.9}
                  >
                    {zone.name}
                  </text>
                )}
                {hasJc && (
                  <>
                    <rect
                      x={`${x}%`}
                      y="0"
                      width={`${zone.widthPercent}%`}
                      height="100%"
                      fill="#00D4FF"
                      opacity={0.15}
                      className="animate-pulse"
                    />
                    <text
                      x={`${x + zone.widthPercent / 2}%`}
                      y="25%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#00D4FF"
                      fontSize="7"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      JC
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
        {hoveredZone && (
          <div className="absolute top-0 right-0 bg-black/80 text-xs text-white px-2 py-1 rounded-bl pointer-events-none z-10 font-mono">
            {hoveredZone} ({zones.find(z => z.name === hoveredZone)?.startCol}-{zones.find(z => z.name === hoveredZone)?.endCol})
          </div>
        )}
      </div>

      <div className="relative h-10 rounded-lg overflow-hidden border border-slate-700/50 bg-[#060E1A]">
        <div className="absolute inset-0 flex">
          {zones
            .filter(z => z.name === "Payload")
            .map(zone => {
              const x = ((zone.startCol - 1) / state.frame.columns) * 100;
              return (
                <div key="payload-bg" className="absolute inset-0" style={{ left: `${x}%`, width: `${zone.widthPercent}%` }}>
                  <div className="w-full h-full relative">
                    {timeslotSegments.map((ts) => (
                      <div
                        key={ts.index}
                        className="absolute h-full flex items-center justify-center text-[9px] font-mono transition-all duration-300 border-r border-slate-800/50 group cursor-pointer"
                        style={{
                          left: `${((ts.index - 1) / state.frame.numTimeslots) * 100}%`,
                          width: `${(ts.tsCount / state.frame.numTimeslots) * 100}%`,
                          backgroundColor: ts.color,
                        }}
                      >
                        <span className={ts.hasLck ? "text-red-200 font-bold" : ts.occupied ? (ts.signalType === "ODUflex" ? "text-purple-100 font-bold" : "text-amber-900 font-bold") : "text-slate-600"}>
                          {ts.tsCount > 1 ? `TS${ts.index}-${ts.index + ts.tsCount - 1}` : `TS${ts.index}`}
                        </span>
                        {ts.signalType === "ODUflex" && ts.occupied && (
                          <span className="absolute left-1 top-0.5 text-[6px] text-purple-200 opacity-80">flex</span>
                        )}
                        {ts.hasLck && (
                          <div className="absolute inset-0 border-2 border-red-500/70 rounded-sm animate-pulse" />
                        )}
                        {ts.occupied && !ts.hasLck && (
                          <div className="absolute inset-0 border-2 border-opacity-50 rounded-sm animate-pulse"
                               style={{ borderColor: ts.signalType === "ODUflex" ? "#C084FC" : "#FFD466" }} />
                        )}
                        {ts.justType === "negative" && ts.occupied && !ts.hasLck && (
                          <div className="absolute top-0 right-0.5 text-blue-400">
                            <ArrowDown size={7} />
                          </div>
                        )}
                        {ts.justType === "positive" && ts.occupied && !ts.hasLck && (
                          <div className="absolute top-0 right-0.5 text-orange-400">
                            <ArrowUp size={7} />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: ts.borderColor }} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
        {zones.map((zone) => (
          <div key={zone.name} className="flex items-center gap-1.5 text-xs text-slate-400">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: zone.color }} />
            <span>{zone.name}</span>
            <span className="text-slate-600">({zone.startCol}-{zone.endCol})</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-3 h-3 rounded-sm bg-amber-500" />
          <span>ODU0时隙</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-3 h-3 rounded-sm bg-purple-500" />
          <span>ODUflex时隙</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span>LCK告警</span>
        </div>
        {hasAnyJustification && (
          <>
            <div className="flex items-center gap-1 text-xs text-blue-400">
              <ArrowDown size={10} />
              <span>负调整</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-orange-400">
              <ArrowUp size={10} />
              <span>正调整</span>
            </div>
          </>
        )}
      </div>

      <div className="bg-[#0A1628]/80 border border-slate-700/30 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-400">行 {selectedRow + 1} 字节预览</h4>
          {hasAnyJustification && (
            <span className="text-[9px] text-cyan-400/70">Col 15-16: JC/NJO/PJO</span>
          )}
        </div>
        <div className="flex flex-wrap gap-0.5 font-mono text-[9px]">
          {state.frame.data[selectedRow]?.slice(0, 48).map((byte: number, i: number) => {
            const zone = zones.find(z => (i + 1) >= z.startCol && (i + 1) <= z.endCol);
            const zoneColor = zone?.color || "#333";
            const isJcCol = i === 14 || i === 15;
            const isNjoPjoCol = i === 16;
            return (
              <div
                key={i}
                className={`w-7 h-5 flex items-center justify-center rounded-sm ${
                  isJcCol && hasAnyJustification ? "ring-1 ring-cyan-400/50" : ""
                } ${isNjoPjoCol && hasAnyJustification ? "ring-1 ring-blue-400/30" : ""}`}
                style={{ backgroundColor: zoneColor + "40", color: isJcCol && hasAnyJustification ? "#00D4FF" : zoneColor }}
                title={`Col ${i + 1}: 0x${byte.toString(16).padStart(2, "0").toUpperCase()}${isJcCol ? " (JC)" : ""}${isNjoPjoCol ? " (NJO/PJO)" : ""}`}
              >
                {byte.toString(16).padStart(2, "0").toUpperCase()}
              </div>
            );
          })}
          <div className="w-7 h-5 flex items-center justify-center text-slate-600 text-[8px]">...</div>
          <div className="text-slate-600 text-[8px] self-center ml-1">共 {state.frame.columns} 列</div>
        </div>
      </div>
    </div>
  );
}
