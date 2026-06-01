import React, { useState, useEffect } from 'react';
import { Play, RotateCcw, Code2, GitBranch, GitMerge, ArrowRightLeft, AlertCircle, Cpu, CheckCircle2, XCircle, Clock, Wrench } from 'lucide-react';
import { useLLVMStore } from '@/store/useLLVMStore';
import { useCompile } from '@/hooks/useCompile';
import { getToolchainStatus } from '@/services/api';
import CodeEditor from '@/components/CodeEditor';
import PassSelector from '@/components/PassSelector';
import IRCompareView from '@/components/IRCompareView';
import CFGViewer from '@/components/CFGViewer';
import DFGViewer from '@/components/DFGViewer';
import TimingViewer from '@/components/TimingViewer';
import PassDevPanel from '@/components/PassDevPanel';
import CodeLibrary from '@/components/CodeLibrary';

const Home: React.FC = () => {
  const {
    code,
    setCode,
    activeView,
    setActiveView,
    isCompiling,
    error,
    setError,
    compileResult,
    snippetName,
    resetEditor,
  } = useLLVMStore();

  const { compile } = useCompile();
  const [toolchainStatus, setToolchainStatus] = useState<{
    clangAvailable: boolean;
    optAvailable: boolean;
    clangVersion?: string;
    optVersion?: string;
  } | null>(null);
  const [showToolchainInfo, setShowToolchainInfo] = useState(false);

  useEffect(() => {
    const checkToolchain = async () => {
      try {
        const status = await getToolchainStatus();
        setToolchainStatus(status);
      } catch (err) {
        console.error('Failed to check toolchain:', err);
      }
    };
    checkToolchain();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      compile();
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'r') {
      e.preventDefault();
      resetEditor();
    }
  };

  const viewTabs = [
    { id: 'ir' as const, label: 'IR 对比', icon: ArrowRightLeft },
    { id: 'cfg' as const, label: '控制流图', icon: GitBranch },
    { id: 'dfg' as const, label: '数据流图', icon: GitMerge },
    { id: 'timing' as const, label: '时序分析', icon: Clock },
    { id: 'pass-dev' as const, label: 'Pass开发', icon: Wrench },
  ];

  return (
    <div
      className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <header className="h-14 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 flex items-center px-4 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100 leading-tight">LLVM IR 可视化平台</h1>
            <p className="text-[10px] text-slate-500 leading-tight">Interactive C → IR Analysis</p>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-700 mx-2" />

        {snippetName && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700">
            <Code2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-sm text-slate-300 font-medium">{snippetName}</span>
          </div>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowToolchainInfo(!showToolchainInfo)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
              toolchainStatus?.clangAvailable
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
            title="工具链状态"
          >
            {toolchainStatus?.clangAvailable ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            <span className="text-xs">Clang</span>
          </button>

          {toolchainStatus && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
              toolchainStatus.optAvailable
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
              title="LLVM opt 工具状态"
            >
              {toolchainStatus.optAvailable ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span className="text-xs">opt</span>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-slate-700 mx-2" />

        <PassSelector />

        <button
          onClick={compile}
          disabled={isCompiling || !code.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 disabled:shadow-none"
        >
          {isCompiling ? (
            <>
              <RotateCcw className="w-4 h-4 animate-spin" />
              编译中...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              编译
            </>
          )}
        </button>

        <button
          onClick={resetEditor}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          title="重置 (Ctrl+Shift+R)"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </header>

      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30 flex items-center gap-2 flex-shrink-0">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-xs text-red-400 hover:text-red-300"
          >
            关闭
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <CodeLibrary />

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 grid grid-rows-2 gap-4 p-4 overflow-hidden">
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-1 py-2 mb-2">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-slate-300">C 源代码</span>
                  <span className="text-xs text-slate-500">
                    {code.split('\n').length} 行 · {code.length} 字符
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">
                  快捷键: <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 mx-1">Ctrl</kbd>
                  +
                  <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 mx-1">Enter</kbd>
                  编译
                </span>
              </div>
              <div className="flex-1 overflow-hidden">
                <CodeEditor value={code} onChange={setCode} />
              </div>
            </div>

            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-1 px-1 py-2 border-b border-slate-800 mb-2">
                {viewTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveView(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeView === tab.id
                        ? 'bg-slate-800 text-slate-100 shadow-inner'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.id === 'ir' && compileResult && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">
                        {compileResult.originalIR.split('\n').length - compileResult.optimizedIR.split('\n').length > 0
                          ? `-${compileResult.originalIR.split('\n').length - compileResult.optimizedIR.split('\n').length} 行`
                          : `+${Math.abs(compileResult.originalIR.split('\n').length - compileResult.optimizedIR.split('\n').length)} 行`}
                      </span>
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                {compileResult && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>
                      原始: {compileResult.originalIR.split('\n').length} 行
                    </span>
                    <span className="text-slate-600">→</span>
                    <span>
                      优化: {compileResult.optimizedIR.split('\n').length} 行
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                {activeView === 'ir' && <IRCompareView />}
                {activeView === 'cfg' && <CFGViewer />}
                {activeView === 'dfg' && <DFGViewer />}
                {activeView === 'timing' && <TimingViewer />}
                {activeView === 'pass-dev' && <PassDevPanel />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showToolchainInfo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowToolchainInfo(false)}>
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-5 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-200 mb-4">工具链状态</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                <div className="flex items-center gap-2">
                  {toolchainStatus?.clangAvailable ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span className="text-slate-300">Clang</span>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  {toolchainStatus?.clangAvailable ? '已安装' : '未检测到'}
                </span>
              </div>
              {toolchainStatus?.clangVersion && (
                <p className="text-xs text-slate-500 px-3">{toolchainStatus.clangVersion}</p>
              )}
              <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                <div className="flex items-center gap-2">
                  {toolchainStatus?.optAvailable ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                  )}
                  <span className="text-slate-300">LLVM opt</span>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  {toolchainStatus?.optAvailable ? '已安装' : '未检测到'}
                </span>
              </div>
              {toolchainStatus?.optVersion && (
                <p className="text-xs text-slate-500 px-3">{toolchainStatus.optVersion}</p>
              )}
              {!toolchainStatus?.optAvailable && (
                <p className="text-xs text-amber-400 bg-amber-500/10 p-3 rounded-lg">
                  提示: 未检测到 opt 工具，将使用 Clang -O1 进行优化。安装完整 LLVM 工具链可获得更精确的 Pass 控制。
                </p>
              )}
            </div>
            <button
              onClick={() => setShowToolchainInfo(false)}
              className="mt-4 w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
