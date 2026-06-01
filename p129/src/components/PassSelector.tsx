import React, { useState, useEffect } from 'react';
import { ChevronDown, Check, Info, X, ChevronUp, ChevronRight, GripVertical } from 'lucide-react';
import { useLLVMStore } from '@/store/useLLVMStore';
import { getPasses } from '@/services/api';
import type { OptimizePass } from '@shared/types';

const PassSelector: React.FC = () => {
  const { selectedPasses, availablePasses, togglePass, setAvailablePasses, setSelectedPasses } = useLLVMStore();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredPass, setHoveredPass] = useState<string | null>(null);

  const movePassUp = (index: number) => {
    if (index <= 0) return;
    const newPasses = [...selectedPasses];
    [newPasses[index - 1], newPasses[index]] = [newPasses[index], newPasses[index - 1]];
    setSelectedPasses(newPasses);
  };

  const movePassDown = (index: number) => {
    if (index >= selectedPasses.length - 1) return;
    const newPasses = [...selectedPasses];
    [newPasses[index + 1], newPasses[index]] = [newPasses[index], newPasses[index + 1]];
    setSelectedPasses(newPasses);
  };

  useEffect(() => {
    const fetchPasses = async () => {
      try {
        const result = await getPasses();
        if (result.success) {
          setAvailablePasses(result.passes);
        }
      } catch (error) {
        console.error('Failed to fetch passes:', error);
      }
    };
    fetchPasses();
  }, [setAvailablePasses]);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'transform':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'analysis':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'utility':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-200 transition-all duration-200 min-w-[200px]"
      >
        <span className="text-sm font-medium">
          {selectedPasses.length > 0
            ? `${selectedPasses.length} Pass${selectedPasses.length > 1 ? 'es' : ''} 已选`
            : '选择优化 Pass'}
        </span>
        <ChevronDown
          className={`w-4 h-4 ml-auto transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {selectedPasses.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 max-w-[400px]">
          {selectedPasses.map((passName, index) => {
            const pass = availablePasses.find((p) => p.name === passName);
            return (
              <span
                key={passName}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full border ${
                  pass ? getCategoryColor(pass.category) : 'bg-slate-600 text-slate-300'
                }`}
                title={`应用顺序 #${index + 1}`}
              >
                <span className="text-[10px] opacity-70">#{index + 1}</span>
                {passName}
                <button
                  onClick={() => togglePass(passName)}
                  className="hover:bg-white/10 rounded p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-[400px] bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {selectedPasses.length > 0 && (
            <div className="p-3 border-b border-slate-700 bg-blue-500/10">
              <h3 className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-1.5">
                <ChevronRight className="w-3 h-3" />
                应用顺序 (从上到下)
              </h3>
              <div className="space-y-1">
                {selectedPasses.map((passName, index) => {
                  const pass = availablePasses.find((p) => p.name === passName);
                  return (
                    <div
                      key={passName}
                      className="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg group"
                    >
                      <GripVertical className="w-4 h-4 text-slate-500 cursor-grab flex-shrink-0" />
                      <span className="text-[10px] text-slate-500 w-4 text-center">
                        {index + 1}
                      </span>
                      <span className="text-xs font-mono text-slate-200 flex-1">
                        {passName}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            movePassUp(index);
                          }}
                          disabled={index === 0}
                          className="p-1 hover:bg-slate-600 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronUp className="w-3 h-3 text-slate-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            movePassDown(index);
                          }}
                          disabled={index === selectedPasses.length - 1}
                          className="p-1 hover:bg-slate-600 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronDown className="w-3 h-3 text-slate-400" />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePass(passName);
                        }}
                        className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-3 border-b border-slate-700 bg-slate-800/50">
            <h3 className="text-sm font-semibold text-slate-200">可选 Pass</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              点击添加到应用队列
            </p>
          </div>

          <div className="max-h-[280px] overflow-y-auto p-2">
            {availablePasses.map((pass: OptimizePass) => {
              const isSelected = selectedPasses.includes(pass.name);
              return (
                <div
                  key={pass.name}
                  onMouseEnter={() => setHoveredPass(pass.name)}
                  onMouseLeave={() => setHoveredPass(null)}
                  onClick={() => togglePass(pass.name)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-150 mb-1 ${
                    isSelected
                      ? 'bg-blue-500/20 border border-blue-500/40'
                      : 'hover:bg-slate-700/50 border border-transparent'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-slate-500 hover:border-slate-400'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-slate-200">{pass.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border ${getCategoryColor(
                          pass.category
                        )}`}
                      >
                        {pass.category}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded">
                          已选 #{selectedPasses.indexOf(pass.name) + 1}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {pass.description}
                    </p>
                  </div>
                  <Info className="w-4 h-4 text-slate-500 flex-shrink-0" />
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-slate-700 bg-slate-800/50 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {selectedPasses.length} / {availablePasses.length} 个 Pass 已选
            </span>
            <div className="flex items-center gap-2">
              {selectedPasses.length > 0 && (
                <button
                  onClick={() => setSelectedPasses([])}
                  className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  清空
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PassSelector;
