import { useAppStore } from '@/store/appStore';
import { RotateCcw } from 'lucide-react';

export default function SopInput() {
  const { variableCount, minterms, dontCare, setMinterms, setDontCare, reset } = useAppStore();
  const maxMinterm = Math.pow(2, variableCount) - 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">积和式输入</h3>
        <button onClick={reset} className="px-2 py-1 text-xs rounded bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700 transition-colors flex items-center gap-1">
          <RotateCcw className="w-3 h-3" /> 重置
        </button>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-amber-300">
          最小项 <span className="text-slate-500 font-normal">(必填，0-{maxMinterm})</span>
        </label>
        <input
          type="text"
          value={minterms}
          onChange={e => setMinterms(e.target.value)}
          placeholder={`例如: 0, 1, 2, 5, 7`}
          className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/30 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        />
        <p className="text-xs text-slate-500">输入使函数值为1的最小项编号，用逗号或空格分隔</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-purple-300">
          无关项 <span className="text-slate-500 font-normal">(选填，0-{maxMinterm})</span>
        </label>
        <input
          type="text"
          value={dontCare}
          onChange={e => setDontCare(e.target.value)}
          placeholder={`例如: 3, 6`}
          className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/30 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        />
        <p className="text-xs text-slate-500">输入函数值可任意的最小项编号（对应真值表中的 ×）</p>
      </div>

      <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
        <p className="text-xs text-slate-500 leading-relaxed">
          <span className="text-indigo-400 font-medium">格式说明：</span>直接输入最小项编号，支持逗号、空格或分号分隔。
          例如 <code className="text-amber-400/80">0,1,2,5,7</code> 或 <code className="text-amber-400/80">0 1 2 5 7</code>，
          表示 Σm(0,1,2,5,7)。
        </p>
      </div>
    </div>
  );
}
