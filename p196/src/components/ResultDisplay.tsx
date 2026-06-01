import React, { useState } from "react";
import { Copy, Check, ChevronDown, ChevronRight, Code, Cpu } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import type { SimplifyResponse, PrimeImplicant } from "@/types";

const VARIABLES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];

function generateVerilog(result: SimplifyResponse, variableCount: number): string {
  const inputs = VARIABLES.slice(0, variableCount).join(", ");

  if (result.expression === "0") {
    return `module boolean_simplifier(
  input ${inputs},
  output reg f
);

  always @(*) begin
    f = 1'b0;
  end

endmodule`;
  }

  if (result.expression === "1") {
    return `module boolean_simplifier(
  input ${inputs},
  output reg f
);

  always @(*) begin
    f = 1'b1;
  end

endmodule`;
  }

  const terms: string[] = [];
  for (const prime of result.essentialPrimes) {
    const literals: string[] = [];
    for (let i = 0; i < prime.binary.length; i++) {
      const bit = prime.binary[i];
      const variable = VARIABLES[i];
      if (bit === '0') {
        literals.push("~" + variable);
      } else if (bit === '1') {
        literals.push(variable);
      }
    }
    if (literals.length === 0) {
      terms.push("1'b1");
    } else {
      terms.push(literals.join(" & "));
    }
  }

  const expression = terms.length === 1 ? terms[0] : terms.join(" | ");

  return `module boolean_simplifier(
  input ${inputs},
  output reg f
);

  always @(*) begin
    f = ${expression};
  end

endmodule`;
}

export const ResultDisplay: React.FC = () => {
  const { result, variableCount, error } = useAppStore();
  const [showSteps, setShowSteps] = useState(false);
  const [showPrimes, setShowPrimes] = useState(false);
  const [showVerilog, setShowVerilog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verilogCopied, setVerilogCopied] = useState(false);

  if (error) {
    return (
      <div className="mt-8 p-4 bg-red-900/20 border border-red-700/30 rounded-xl">
        <p className="text-red-400 text-sm font-medium">{error}</p>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const verilogCode = generateVerilog(result, variableCount);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.expression);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  const handleCopyVerilog = async () => {
    try {
      await navigator.clipboard.writeText(verilogCode);
      setVerilogCopied(true);
      setTimeout(() => setVerilogCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  const allPrimes: (PrimeImplicant & { isEssential: boolean })[] = [
    ...result.essentialPrimes.map((p) => ({ ...p, isEssential: true })),
    ...result.primeImplicants.map((p) => ({ ...p, isEssential: false })),
  ];

  return (
    <div className="mt-8 space-y-6">
      <div className="bg-gradient-to-br from-amber-900/20 via-slate-800/30 to-amber-900/10 border border-amber-700/30 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-amber-400">简化结果</h3>
          <button
            onClick={handleCopy}
            className="p-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 rounded-lg transition-colors group"
            title="复制表达式"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-slate-400 group-hover:text-slate-200" />
            )}
          </button>
        </div>
        <pre
          className="text-2xl font-bold text-amber-300 font-mono break-all"
          style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}
        >
          f = {result.expression}
        </pre>
      </div>

      <div className="border border-slate-700/30 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowPrimes(!showPrimes)}
          className="w-full px-5 py-4 flex items-center justify-between bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-medium text-slate-200">素蕴含项</span>
            <span className="px-2 py-0.5 bg-indigo-900/40 text-indigo-300 text-xs rounded-full">
              {allPrimes.length}
            </span>
          </div>
          {showPrimes ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {showPrimes && (
          <div className="p-4 bg-slate-900/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="pb-2 font-medium">二进制</th>
                  <th className="pb-2 font-medium">最小项</th>
                  <th className="pb-2 font-medium">类型</th>
                </tr>
              </thead>
              <tbody className="font-mono" style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
                {allPrimes.map((prime, index) => (
                  <tr key={index} className="border-t border-slate-700/20">
                    <td className="py-2 text-indigo-300">{prime.binary}</td>
                    <td className="py-2 text-slate-300">{prime.minterms.join(", ")}</td>
                    <td className="py-2">
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
              {result.steps.length}
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
            {result.steps.map((step, index) => (
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
              {verilogCode}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultDisplay;
