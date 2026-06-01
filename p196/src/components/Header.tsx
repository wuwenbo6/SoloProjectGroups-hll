import { Zap } from 'lucide-react';

export default function Header() {
  return (
    <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <Zap className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight" style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
              QMC Simplifier
            </h1>
            <p className="text-xs text-slate-400">Quine-McCluskey 布尔函数化简器</p>
          </div>
        </div>
      </div>
    </header>
  );
}
