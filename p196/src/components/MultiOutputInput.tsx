import { useAppStore } from '@/store/appStore';
import type { CellValue } from '@/types';
import { RotateCcw } from 'lucide-react';

export default function MultiOutputInput() {
  const { variableCount, outputCount, outputNames, truthTables, setMultiTruthTableCell, resetMulti } = useAppStore();
  const variables = 'ABCDEFGHIJKLMNOP'.slice(0, variableCount).split('');
  const totalRows = Math.pow(2, variableCount);

  const cycleCell = (outputIndex: number, rowIndex: number) => {
    const current = truthTables[outputIndex][rowIndex];
    const next: CellValue = current === 0 ? 1 : current === 1 ? 2 : 0;
    setMultiTruthTableCell(outputIndex, rowIndex, next);
  };

  const setAllForOutput = (outputIndex: number, value: CellValue) => {
    for (let i = 0; i < totalRows; i++) {
      setMultiTruthTableCell(outputIndex, i, value);
    }
  };

  const setAllForAll = (value: CellValue) => {
    for (let o = 0; o < outputCount; o++) {
      for (let i = 0; i < totalRows; i++) {
        setMultiTruthTableCell(o, i, value);
      }
    }
  };

  const toggleAllForOutput = (outputIndex: number) => {
    for (let i = 0; i < totalRows; i++) {
      const current = truthTables[outputIndex][i];
      if (current !== 2) {
        setMultiTruthTableCell(outputIndex, i, current === 0 ? 1 : 0);
      }
    }
  };

  const toggleAllForAll = () => {
    for (let o = 0; o < outputCount; o++) {
      for (let i = 0; i < totalRows; i++) {
        const current = truthTables[o][i];
        if (current !== 2) {
          setMultiTruthTableCell(o, i, current === 0 ? 1 : 0);
        }
      }
    }
  };

  const getCellClass = (value: CellValue) => {
    if (value === 1) return 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30';
    if (value === 2) return 'bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-purple-500/30';
    return 'bg-slate-800/50 border-slate-600/30 text-slate-400 hover:bg-slate-700/50';
  };

  const outputColors = [
    'text-amber-300',
    'text-emerald-300',
    'text-sky-300',
    'text-rose-300',
    'text-violet-300',
    'text-orange-300',
    'text-cyan-300',
    'text-lime-300',
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">多输出真值表输入</h3>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setAllForAll(1)} className="px-2 py-1 text-xs rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
            全部置1
          </button>
          <button onClick={() => setAllForAll(0)} className="px-2 py-1 text-xs rounded bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700 transition-colors">
            全部置0
          </button>
          <button onClick={toggleAllForAll} className="px-2 py-1 text-xs rounded bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700 transition-colors">
            全部反选
          </button>
          <button onClick={resetMulti} className="px-2 py-1 text-xs rounded bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700 transition-colors flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> 重置
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-2">
        点击输出列切换: 0 → 1 → ×(无关项) → 0
      </div>

      <div className="space-y-2 mb-4">
        {outputNames.map((name, outputIndex) => (
          <div key={outputIndex} className="flex items-center gap-2 text-xs">
            <span className={`font-medium ${outputColors[outputIndex % outputColors.length]}`}>{name}:</span>
            <div className="flex gap-1">
              <button onClick={() => setAllForOutput(outputIndex, 1)} className="px-2 py-0.5 text-xs rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
                置1
              </button>
              <button onClick={() => setAllForOutput(outputIndex, 0)} className="px-2 py-0.5 text-xs rounded bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700 transition-colors">
                置0
              </button>
              <button onClick={() => toggleAllForOutput(outputIndex)} className="px-2 py-0.5 text-xs rounded bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700 transition-colors">
                反选
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-auto max-h-[480px] rounded-lg border border-slate-700/50">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-800/90 backdrop-blur-sm">
              {variables.map(v => (
                <th key={v} className="px-2 py-2 text-center font-semibold text-indigo-300 border-b border-slate-700/50" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  {v}
                </th>
              ))}
              {outputNames.map((name, outputIndex) => (
                <th
                  key={outputIndex}
                  className={`px-2 py-2 text-center font-semibold border-b border-slate-700/50 ${outputIndex === 0 ? 'border-l border-slate-600/30' : 'border-l border-slate-700/30'} ${outputColors[outputIndex % outputColors.length]}`}
                  style={{ fontFamily: '"JetBrains Mono", monospace' }}
                >
                  {name}
                </th>
              ))}
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
                    <td key={colIndex} className="px-2 py-1.5 text-center text-slate-400" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                      {bit}
                    </td>
                  ))}
                  {truthTables.map((table, outputIndex) => (
                    <td key={outputIndex} className={`px-2 py-1.5 text-center ${outputIndex === 0 ? 'border-l border-slate-600/30' : 'border-l border-slate-700/30'}`}>
                      <button
                        onClick={() => cycleCell(outputIndex, rowIndex)}
                        className={`w-9 h-7 rounded border transition-all duration-150 font-medium text-sm cursor-pointer ${getCellClass(table[rowIndex])}`}
                      >
                        {table[rowIndex] === 2 ? '×' : table[rowIndex]}
                      </button>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
