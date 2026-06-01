import type { ProtocolLayer } from "@/utils/types";
import LayerCard from "./LayerCard";
import HexViewer from "./HexViewer";

interface ProtocolStackProps {
  layers: ProtocolLayer[];
  rawHex: string;
  selectedLayerIndex: number | null;
  onSelectLayer: (index: number | null) => void;
}

export default function ProtocolStack({ layers, rawHex, selectedLayerIndex, onSelectLayer }: ProtocolStackProps) {
  if (layers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-slate-600">
        <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center mb-4">
          <span className="text-2xl">📦</span>
        </div>
        <p className="font-ui text-sm">运行封装或解封装以查看协议栈</p>
      </div>
    );
  }

  const selectedLayer = selectedLayerIndex !== null ? layers[selectedLayerIndex] : null;
  const highlightOffset = selectedLayer?.offset ?? 0;
  const highlightLen = selectedLayer ? selectedLayer.raw_hex.length / 2 : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {layers.map((layer, i) => (
          <LayerCard
            key={i}
            layer={layer}
            index={i}
            isSelected={selectedLayerIndex === i}
            onClick={() => onSelectLayer(selectedLayerIndex === i ? null : i)}
          />
        ))}
      </div>

      <div className="mt-6">
        <h3 className="font-ui text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
          Raw Packet Hex Dump
        </h3>
        <HexViewer
          hex={rawHex}
          highlightOffset={highlightOffset}
          highlightLen={highlightLen}
        />
      </div>
    </div>
  );
}
