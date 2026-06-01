import { Activity, Database, Layers, RefreshCcw } from 'lucide-react';

interface HeaderProps {
  onLoadSample: () => void;
  onLoadMultiTagSample: () => void;
  onClear: () => void;
  hasData: boolean;
}

export function Header({ onLoadSample, onLoadMultiTagSample, onClear, hasData }: HeaderProps) {
  return (
    <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">UWB 卡尔曼滤波平台</h1>
              <p className="text-xs text-slate-400">Kalman Filter for UWB Ranging</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onLoadSample}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all duration-200 border border-slate-600 hover:border-cyan-500 hover:shadow-lg hover:shadow-cyan-500/10"
              title="加载单标签示例"
            >
              <Database className="w-4 h-4" />
              <span className="text-sm">单标签示例</span>
            </button>
            <button
              onClick={onLoadMultiTagSample}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all duration-200 border border-slate-600 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/10"
              title="加载多标签示例"
            >
              <Layers className="w-4 h-4" />
              <span className="text-sm">多标签示例</span>
            </button>
            {hasData && (
              <button
                onClick={onClear}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-orange-600/20 text-slate-200 hover:text-orange-400 rounded-lg transition-all duration-200 border border-slate-600 hover:border-orange-500"
              >
                <RefreshCcw className="w-4 h-4" />
                <span className="text-sm">重置</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
