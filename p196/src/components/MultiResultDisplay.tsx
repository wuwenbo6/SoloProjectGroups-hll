import React, { useState } from "react";
import { Copy, Check, ChevronDown, ChevronRight, Code, Cpu, GitMerge } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import type { MultiOutputResponse, PrimeImplicant, SharedTerm } from "@/types";

const VARIABLES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];

const outputColors = [
  { text: "text-amber-300", bg: "from-amber-900/20", border: "border-amber-700/30" },
  { text: "text-emerald-300", bg: "from-emerald-900/20", border: "border-emerald-700/30" },
  { text: "text-sky-300", bg: "from-sky-900/20", border: "border-sky-700/30" },
  { text: "text-rose-300", bg: "from-rose-900/20", border: "border-rose-700/30" },
  { text: "text-violet-300", bg: "from-violet-900/20", border: "border-violet-700/30" },
  { text: "text-orange-300", bg: "from-orange-900/20", border: "border-orange-700/30" },
  { text: "text-cyan-300", bg: "from-cyan-900/20", border: "border-cyan-700/30" },
  { text: "text-lime-300", bg: "from-lime-900/20", border: "border-lime-700/30" },
];

export const MultiResultDisplay: React.FC = () => {
  const { multiResult, variableCount, error, outputNames } = useAppStore();
  const [showSteps, setShowSteps] = useState(false);
  const [showSharedTerms, setShowSharedTerms] = useState(false);
  const [showVerilog, setShowVerilog] = useState(false);
  const [verilogCopied, setVerilogCopied] = useState(false);
  const [copiedExpressions, setCopiedExpressions] = useState<Set<number>>(new Set());
  const [expandedOutputs, setExpandedOutputs] = useState<Set<number>>(new Set());

  if (error) {
    return (
      <div className="mt-8 p-4 bg-red-900/20 border border-red-700/30 rounded-xl">
        <p className="text-red-400 text-sm font-medium">{error}</p>
      </div>
    );
  }

  if (!multiResult) {
    return null;
  }

  const handleCopyExpression = async (index: number, expression: string) => {
    try {
      await navigator.clipboard.writeText(expression);
      setCopiedExpressions(prev => new Set(prev).add(index));
      setTimeout(() => {
        setCopiedExpressions(prev => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }, 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  const handleCopyVerilog = async () => {
    try {
      await navigator.clipboard.writeText(multiResult.verilog);
      setVerilogCopied(true);
      setTimeout(() => setVerilogCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  const toggleOutput = (index: number) => {
    setExpandedOutputs(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const allPrimesForOutput = (output: MultiOutputResponse["outputs"][0]): (PrimeImplicant & { isEssential: boolean })[] => {
    return [
      ...output.essentialPrimes.map((p) => ({ ...p, isEssential: true })),
      ...output.primeImplicants.map((p) => ({ ...p, isEssential: false })),
    ];
  };

  return (
    <div className="mt-8 space-y-6">
      {multiResult.outputs.map((output, index) => {
        const color = outputColors[index % outputColors.length];
        const isExpanded = expandedOutputs.has(index);
        const allPrimes = allPrimesForOutput(output);

        return (
          <div key={index} className={`bg-gradient-to-br ${color.bg} via-slate-800/30 to-slate-900/10 border ${color.border} rounded-2xl overflow-hidden`}>
            <button
              onClick={() => toggleOutput(index)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${color.text}`} style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                  {outputNames[index] || output.name}
                </span>
                <pre className={`text-lg font-bold ${color.text} font-mono`} style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
                  = {output.expression}
                </pre>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyExpression(index, output.expression);
                  }}
                  className="p-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 rounded-lg transition-colors group"
                  title="复制表达式"
                >
                  {copiedExpressions.has(index) ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400 group-hover:text-slate-200" />
                  )}
                </button>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="px-6 pb-4 border-t border-slate-700/20">
                <div className="mt-4">
                  <h4 className="text-xs font-medium text-slate-400 mb-2">素蕴含项 ({allPrimes.length})</h4>
                  <div className="overflow-auto max-h-[200px] rounded-lg border border-slate-700/30">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-800/90">
                        <tr className="text-left text-slate-400">
                          <th className="px-3 py-2 font-medium">二进制</th>
                          <th className="px-3 py-2 font-medium">最小项</th>
                          <th className="px-3 py-2 font-medium">类型</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono" style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
                        {allPrimes.map((prime, primeIndex) => (
                          <tr key={primeIndex} className="border-t border-slate-700/20">
                            <td className="px-3 py-2 text-indigo-300">{prime.binary}</td>
                            <td className="px-3 py-2 text-slate-300">{prime.minterms.join(", ")}</td>
                            <td className="px-3 py-2">
                              {prime.isEssential ? (
                                <span className="px-2 py-0.5 bg-amber-900/40 text-amber-300 text-xs rounded-full">
                                  基本素项
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-700/40 text-slate-400 text-xs rounded-full">
                                  非基本
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="border border-slate-700/30 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowSharedTerms(!showSharedTerms)}
          className="w-full px-5 py-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium text-slate-200">共享项</span>
            <span className="px-2 py-0.5 bg-emerald-900/40 text-emerald-300 text-xs rounded-full">
              {multiResult.sharedTerms.length}
            </span>
          </div>
          {showSharedTerms ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {showSharedTerms && (
          <div className="p-4 bg-slate-900/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="pb-2 font-medium">二进制</th>
                  <th className="pb-2 font-medium">表达式</th>
                  <th className="pb-2 font-medium">被使用</th>
                </tr>
              </thead>
              <tbody className="font-mono" style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
                {multiResult.sharedTerms.map((term: SharedTerm, index: number) => (
                  <tr key={index} className="border-t border-slate-700/20">
                    <td className="py-2 text-indigo-300">{term.binary}</td>
                    <td className="py-2 text-slate-300">{term.expression}</td>
                    <td className="py-2">
                      <div className="flex gap-1 flex-wrap">
                        {term.usedBy.map((user: string, userIndex: number) => {
                          const outputIndex = outputNames.indexOf(user);
                          const color = outputColors[outputIndex % outputColors.length];
                          return (
                            <span
                              key={userIndex}
                              className={`px-2 py-0.5 bg-slate-700/40 ${color.text} text-xs rounded-full`}
                            >
                              {user}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border border-slate-700/30 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowSteps(!showSteps)}
          className="w-full px-5 py-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-purple-400" />
            <span className="text-sm font-medium text-slate-200">算法步骤</span>
            <span className="px-2 py-0.5 bg-purple-900/40 text-purple-300 text-xs rounded-full">
              {multiResult.steps.length}
            </span>
          </div>
          {showSteps ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {showSteps && (
          <div className="p-4 bg-slate-900/30 space-y-3">
            {multiResult.steps.map((step, index) => (
              <div
                key={index}
                className="p-3 bg-slate-800/30 border border-slate-700/20 rounded-lg"
              >
                <p className="text-xs font-medium text-slate-400 mb-1">
                  步骤 {index + 1}: {step.description}
                </p>
                <pre
                  className="text-sm text-slate-300 whitespace-pre-wrap font-mono"
                  style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}
                >
                  {step.content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-slate-700/30 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowVerilog(!showVerilog)}
          className="w-full px-5 py-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Code className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium text-slate-200">Verilog 代码</span>
          </div>
          <div className="flex items-center gap-2">
            {showVerilog && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyVerilog();
                }}
                className="p-1.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/30 rounded-md transition-colors group"
                title="复制 Verilog 代码"
              >
                {verilogCopied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-400 group-hover:text-slate-200" />
                )}
              </button>
            )}
            {showVerilog ? (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-slate-400" />
            )}
          </div>
        </button>

        {showVerilog && (
          <div className="p-4 bg-slate-950/50">
            <pre
              className="text-sm text-emerald-300 overflow-x-auto font-mono"
              style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}
            >
              {multiResult.verilog}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiResultDisplay;
