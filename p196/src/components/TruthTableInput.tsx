import { useAppStore } from '@/store/appStore';
import type { CellValue } from '@/types';
import { RotateCcw } from 'lucide-react';

export default function TruthTableInput() {
  const { variableCount, truthTable, setTruthTableCell, reset } = useAppStore();
  const variables = 'ABCDEFGHIJKLMNOP'.slice(0, variableCount).split('');
  const totalRows = Math.pow(2, variableCount);

  const cycleCell = (index: number) => {
    const current = truthTable[index];
    const next: CellValue = current === 0 ? 1 : current === 1 ? 2 : 0;
    setTruthTableCell(index, next);
  };

  const setAll = (value: CellValue) => {
    for (let i = 0; i < totalRows; i++) {
      setTruthTableCell(i, value);
    }
  };

  const toggleAll = () => {
    for (let i = 0; i < totalRows; i++) {
      setTruthTableCell(i, truthTable[i] === 0 ? 1 : 0);
    }
  };

  const getCellClass = (value: CellValue) => {
    if (value === 1) return 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30';
    if (value === 2) return 'bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-purple-500/30';
    return 'bg-slate-800/50 border-slate-600/30 text-slate-400 hover:bg-slate-700/50';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">真值表输入</h3>
        <div className="flex gap-2">
          <button onClick={() => setAll(1)} className="px-2 py-1 text-xs rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
            全选1
          </button>
          <button onClick={() => setAll(0)} className="px-2 py-1 text-xs rounded bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700 transition-colors">
            全选0
          </button>
          <button onClick={toggleAll} className="px-2 py-1 text-xs rounded bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700 transition-colors">
            反选
          </button>
          <button onClick={reset} className="px-2 py-1 text-xs rounded bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700 transition-colors flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> 重置
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-2">
        点击输出列切换: 0 → 1 → ×(无关项) → 0
      </div>

      <div className="overflow-auto max-h-[480px] rounded-lg border border-slate-700/50">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-800/90 backdrop-blur-sm">
              {variables.map(v => (
                <th key={v} className="px-3 py-2 text-center font-semibold text-indigo-300 border-b border-slate-700/50" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  {v}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-semibold text-amber-300 border-b border-slate-700/50 border-l border-slate-600/30">
                F
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalRows }, (_, rowIndex) => {
              const binary = rowIndex.toString(2).padStart(variableCount, '0');
              return (
                <tr
                  key={rowIndex}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  {binary.split('').map((bit, colIndex) => (
                    <td key={colIndex} className="px-3 py-1.5 text-center text-slate-400" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      {bit}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-center border-l border-slate-600/30">
                    <button
                      onClick={() => cycleCell(rowIndex)}
                      className={`w-10 h-7 rounded border transition-all duration-150 font-medium text-sm cursor-pointer ${getCellClass(truthTable[rowIndex])}`}
                    >
                      {truthTable[rowIndex] === 2 ? '×' : truthTable[rowIndex]}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
