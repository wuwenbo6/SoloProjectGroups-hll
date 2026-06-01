import type { ProtocolLayer } from "@/utils/types";
import { LAYER_COLORS } from "@/utils/types";
import FieldTable from "./FieldTable";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { useState } from "react";

interface LayerCardProps {
  layer: ProtocolLayer;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}

export default function LayerCard({ layer, index, isSelected, onClick }: LayerCardProps) {
  const [expanded, setExpanded] = useState(true);
  const colors = LAYER_COLORS[layer.name] || LAYER_COLORS["Payload"];

  const byteLen = layer.raw_hex.length / 2;

  return (
    <div
      className={`layer-card rounded-xl border ${colors.border} ${colors.bg} overflow-hidden animate-slide-in-left`}
      style={{ animationDelay: `${index * 80}ms`, marginLeft: `${index * 16}px` }}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => {
          onClick();
          setExpanded(!expanded);
        }}
      >
        <Layers className={`w-4 h-4 ${colors.text}`} />
        <span className={`font-ui font-semibold text-sm ${colors.text}`}>{layer.name}</span>
        <span className="text-xs text-slate-500 font-mono-display">
          {byteLen} bytes | offset {layer.offset}
        </span>
        <div className="flex-1" />
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500" />
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-3 border-t border-slate-800/30">
          <FieldTable fields={layer.fields} />
          <div className="mt-2 px-2 py-1.5 bg-slate-950/60 rounded-md font-mono-display text-[10px] text-slate-500 break-all">
            {layer.raw_hex}
          </div>
        </div>
      )}

      {isSelected && (
        <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-purple-500 to-cyan-500" />
      )}
    </div>
  );
}
