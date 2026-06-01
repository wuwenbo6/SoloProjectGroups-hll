interface Props {
  rawHex: string;
}

export default function HexViewer({ rawHex }: Props) {
  if (!rawHex) return null;

  const bytesPerRow = 16;
  const rows: { offset: number; hex: string; ascii: string }[] = [];

  for (let i = 0; i < rawHex.length; i += bytesPerRow * 2) {
    const offset = i / 2;
    const rowHex = rawHex.slice(i, i + bytesPerRow * 2);
    let hex = '';
    let ascii = '';

    for (let j = 0; j < rowHex.length; j += 2) {
      const byteHex = rowHex.slice(j, j + 2);
      hex += byteHex + ' ';
      const byteVal = parseInt(byteHex, 16);
      ascii += byteVal >= 0x20 && byteVal <= 0x7e ? String.fromCharCode(byteVal) : '.';
    }

    rows.push({ offset, hex: hex.trimEnd(), ascii });
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
        原始数据
      </h3>

      <div className="overflow-x-auto">
        <pre className="font-mono text-[11px] leading-5">
          <span className="select-none text-slate-600">Offset  </span>
          <span className="select-none text-slate-600">
            00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F
          </span>
          {'  '}
          <span className="select-none text-slate-600">ASCII</span>
          {'\n'}
          {rows.map((row, i) => (
            <div key={i}>
              <span className="select-none text-slate-600">
                {row.offset.toString(16).toUpperCase().padStart(4, '0')}  {' '}
              </span>
              <span className="text-slate-300">{row.hex}</span>
              {'  '}
              <span className="text-slate-500">{row.ascii}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
