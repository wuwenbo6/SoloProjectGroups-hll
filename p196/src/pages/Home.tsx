import { useAppStore } from '@/store/appStore';
import Header from '@/components/Header';
import TruthTableInput from '@/components/TruthTableInput';
import SopInput from '@/components/SopInput';
import ResultDisplay from '@/components/ResultDisplay';
import MultiOutputInput from '@/components/MultiOutputInput';
import MultiResultDisplay from '@/components/MultiResultDisplay';
import { Minus, Plus, Play, Loader2 } from 'lucide-react';
import type { InputType, OutputMode } from '@/types';

export default function Home() {
  const {
    variableCount,
    inputType,
    outputMode,
    outputCount,
    outputNames,
    isLoading,
    setVariableCount,
    setInputType,
    setOutputMode,
    setOutputCount,
    setOutputName,
    simplify,
    simplifyMulti,
  } = useAppStore();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      <div className="relative z-10">
        <Header />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6 p-4 bg-slate-900/50 border border-slate-700/30 rounded-xl backdrop-blur-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400">变量数:</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setVariableCount(Math.max(2, variableCount - 1))}
                    disabled={variableCount <= 2}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-600/30 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-10 text-center text-lg font-bold text-amber-300" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                    {variableCount}
                  </span>
                  <button
                    onClick={() => setVariableCount(Math.min(12, variableCount + 1))}
                    disabled={variableCount >= 12}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-600/30 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="h-6 w-px bg-slate-700 hidden sm:block" />

              <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg border border-slate-700/30">
                {(['single', 'multi'] as OutputMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setOutputMode(mode)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                      outputMode === mode
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm shadow-emerald-500/10'
                        : 'text-slate-400 hover:text-slate-300 border border-transparent'
                    }`}
                  >
                    {mode === 'single' ? '单输出' : '多输出'}
                  </button>
                ))}
              </div>

              {outputMode === 'single' && (
                <>
                  <div className="h-6 w-px bg-slate-700 hidden sm:block" />
                  <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg border border-slate-700/30">
                    {(['truthTable', 'sumOfProducts'] as InputType[]).map(type => (
                      <button
                        key={type}
                        onClick={() => setInputType(type)}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                          inputType === type
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-sm shadow-indigo-500/10'
                            : 'text-slate-400 hover:text-slate-300 border border-transparent'
                        }`}
                      >
                        {type === 'truthTable' ? '真值表' : '积和式'}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {outputMode === 'multi' && (
                <>
                  <div className="h-6 w-px bg-slate-700 hidden sm:block" />
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">输出数:</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setOutputCount(Math.max(2, outputCount - 1))}
                        disabled={outputCount <= 2}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-600/30 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-10 text-center text-lg font-bold text-emerald-300" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                        {outputCount}
                      </span>
                      <button
                        onClick={() => setOutputCount(Math.min(8, outputCount + 1))}
                        disabled={outputCount >= 8}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 border border-slate-600/30 text-slate-400 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="sm:ml-auto">
                <button
                  onClick={outputMode === 'single' ? simplify : simplifyMulti}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 disabled:cursor-not-allowed text-slate-900 font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {isLoading ? '化简中...' : '化简'}
                </button>
              </div>
            </div>

            {outputMode === 'multi' && (
              <div className="mt-4 pt-4 border-t border-slate-700/30">
                <div className="flex flex-wrap gap-3">
                  {outputNames.map((name, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-sm text-slate-400">输出 {index + 1}:</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setOutputName(index, e.target.value)}
                        className="w-20 px-3 py-1.5 bg-slate-800/50 border border-slate-600/30 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
                        style={{ fontFamily: '"JetBrains Mono", monospace' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-slate-900/50 border border-slate-700/30 rounded-xl backdrop-blur-sm">
              {outputMode === 'single' ? (
                inputType === 'truthTable' ? <TruthTableInput /> : <SopInput />
              ) : (
                <MultiOutputInput />
              )}
            </div>
            <div className="p-5 bg-slate-900/50 border border-slate-700/30 rounded-xl backdrop-blur-sm">
              <h3 className="text-sm font-medium text-slate-300 mb-4">化简结果</h3>
              {outputMode === 'single' ? <ResultDisplay /> : <MultiResultDisplay />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
