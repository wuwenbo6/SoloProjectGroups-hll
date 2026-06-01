interface HexViewerProps {
  hex: string;
  highlightOffset?: number;
  highlightLen?: number;
}

export default function HexViewer({ hex, highlightOffset = 0, highlightLen = 0 }: HexViewerProps) {
  const bytes: { val: string; highlight: boolean }[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const byteOffset = i / 2;
    const highlight =
      highlightLen > 0 && byteOffset >= highlightOffset && byteOffset < highlightOffset + highlightLen;
    bytes.push({ val: hex.substring(i, i + 2), highlight });
  }

  const ROW_SIZE = 16;

  return (
    <div className="font-mono-display text-xs bg-slate-950/80 rounded-lg p-3 overflow-x-auto border border-slate-800/50">
      <div className="flex gap-4 mb-1 text-slate-600 border-b border-slate-800/50 pb-1">
        <span className="w-24">Offset</span>
        <span className="flex-1">Hex Data</span>
        <span className="w-32">ASCII</span>
      </div>
      {Array.from({ length: Math.ceil(bytes.length / ROW_SIZE) }, (_, rowIdx) => {
        const row = bytes.slice(rowIdx * ROW_SIZE, (rowIdx + 1) * ROW_SIZE);
        const offset = (rowIdx * ROW_SIZE).toString(16).padStart(8, "0");
        const hexPart = row.map((b, i) => (
          <span
            key={i}
            className={b.highlight ? "bg-cyan-500/30 text-cyan-300 rounded-sm px-px" : "text-slate-400"}
          >
            {b.val}{i < row.length - 1 ? " " : ""}
          </span>
        ));
        const asciiPart = row
          .map((b) => {
            const code = parseInt(b.val, 16);
            return code >= 32 && code < 127 ? String.fromCharCode(code) : ".";
          })
          .join("");

        return (
          <div key={rowIdx} className="flex gap-4 leading-5">
            <span className="w-24 text-slate-600">{offset}</span>
            <span className="flex-1">{hexPart}</span>
            <span className="w-32 text-slate-600">{asciiPart}</span>
          </div>
        );
      })}
    </div>
  );
}
