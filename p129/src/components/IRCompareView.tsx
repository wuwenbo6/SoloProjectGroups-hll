import React, { useRef, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import { useLLVMStore } from '@/store/useLLVMStore';
import CodeEditor from './CodeEditor';
import * as Diff from 'diff';

const IRCompareView: React.FC = () => {
  const { compileResult, syncScroll, setSyncScroll, error } = useLLVMStore();
  const leftEditorRef = useRef<HTMLDivElement>(null);
  const rightEditorRef = useRef<HTMLDivElement>(null);
  const [diffLines, setDiffLines] = useState<{
    left: Set<number>;
    right: Set<number>;
  }>({ left: new Set(), right: new Set() });

  useEffect(() => {
    if (compileResult?.originalIR && compileResult?.optimizedIR) {
      const changes = Diff.diffLines(
        compileResult.originalIR,
        compileResult.optimizedIR
      );
      const leftDiff = new Set<number>();
      const rightDiff = new Set<number>();
      let leftLine = 0;
      let rightLine = 0;

      for (const part of changes) {
        const lines = part.value.split('\n').filter((l) => l.length > 0 || part.value.endsWith('\n'));
        if (part.added) {
          for (let i = 0; i < lines.length; i++) {
            rightDiff.add(rightLine + i);
          }
          rightLine += lines.length;
        } else if (part.removed) {
          for (let i = 0; i < lines.length; i++) {
            leftDiff.add(leftLine + i);
          }
          leftLine += lines.length;
        } else {
          leftLine += lines.length;
          rightLine += lines.length;
        }
      }
      setDiffLines({ left: leftDiff, right: rightDiff });
    }
  }, [compileResult?.originalIR, compileResult?.optimizedIR]);

  useEffect(() => {
    if (!syncScroll) return;

    const leftElement = leftEditorRef.current?.querySelector('.cm-scroller');
    const rightElement = rightEditorRef.current?.querySelector('.cm-scroller');

    if (!leftElement || !rightElement) return;

    let isSyncing = false;

    const handleLeftScroll = () => {
      if (isSyncing) return;
      isSyncing = true;
      rightElement.scrollTop = leftElement.scrollTop;
      rightElement.scrollLeft = leftElement.scrollLeft;
      requestAnimationFrame(() => {
        isSyncing = false;
      });
    };

    const handleRightScroll = () => {
      if (isSyncing) return;
      isSyncing = true;
      leftElement.scrollTop = rightElement.scrollTop;
      leftElement.scrollLeft = rightElement.scrollLeft;
      requestAnimationFrame(() => {
        isSyncing = false;
      });
    };

    leftElement.addEventListener('scroll', handleLeftScroll);
    rightElement.addEventListener('scroll', handleRightScroll);

    return () => {
      leftElement.removeEventListener('scroll', handleLeftScroll);
      rightElement.removeEventListener('scroll', handleRightScroll);
    };
  }, [syncScroll]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900/50 rounded-lg border border-red-500/30">
        <div className="text-center p-8">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-400 mb-2">编译错误</h3>
          <p className="text-slate-400 text-sm whitespace-pre-wrap max-w-md">{error}</p>
        </div>
      </div>
    );
  }

  if (!compileResult) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-700">
        <div className="text-center p-8">
          <ArrowRightLeft className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-400 mb-2">等待编译</h3>
          <p className="text-slate-500 text-sm">点击"编译"按钮生成 IR 并进行对比</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-sm font-medium text-slate-300">优化前 IR</span>
            <span className="text-xs text-slate-500">
              {compileResult.originalIR.split('\n').length} 行
            </span>
          </div>
          <div className="text-slate-600">→</div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-medium text-slate-300">优化后 IR</span>
            <span className="text-xs text-slate-500">
              {compileResult.optimizedIR.split('\n').length} 行
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSyncScroll(!syncScroll)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-all ${
              syncScroll
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            同步滚动
          </button>
          {diffLines.left.size > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {diffLines.left.size + diffLines.right.size} 处差异
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-4 p-4 overflow-hidden">
        <div ref={leftEditorRef} className="h-full overflow-hidden">
          <div className="h-full relative">
            <CodeEditor
              value={compileResult.originalIR}
              onChange={() => {}}
              readOnly={true}
              placeholder="优化前 IR 将显示在这里..."
            />
          </div>
        </div>
        <div ref={rightEditorRef} className="h-full overflow-hidden">
          <div className="h-full relative">
            <CodeEditor
              value={compileResult.optimizedIR}
              onChange={() => {}}
              readOnly={true}
              placeholder="优化后 IR 将显示在这里..."
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default IRCompareView;
