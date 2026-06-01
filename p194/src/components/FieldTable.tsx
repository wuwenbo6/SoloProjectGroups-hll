import type { FieldEntry } from "@/utils/types";

interface FieldTableProps {
  fields: FieldEntry[];
}

export default function FieldTable({ fields }: FieldTableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-xs font-mono-display">
        <thead>
          <tr className="border-b border-slate-700/50 text-slate-400">
            <th className="py-1.5 px-2 text-left font-medium">Field</th>
            <th className="py-1.5 px-2 text-left font-medium">Value</th>
            <th className="py-1.5 px-2 text-right font-medium">Bits</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => (
            <tr
              key={i}
              className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors"
            >
              <td className="py-1.5 px-2 text-slate-300">{f.name}</td>
              <td className="py-1.5 px-2 text-cyan-300 font-medium">{f.value}</td>
              <td className="py-1.5 px-2 text-right text-slate-500">{f.bits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
