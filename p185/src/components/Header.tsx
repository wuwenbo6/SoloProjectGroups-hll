import { Shield, FileText } from 'lucide-react';

export function Header() {
  return (
    <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white py-8 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-cyan-500/20 rounded-lg">
            <Shield className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            SELinux AVC 日志分析器
          </h1>
        </div>
        <p className="text-slate-400 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          解析 audit.log 中的 AVC 拒绝记录，可视化展示策略违规分布
        </p>
      </div>
    </header>
  );
}
