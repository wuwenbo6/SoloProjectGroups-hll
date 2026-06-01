import { Server, RefreshCw, Settings, Activity, Download, FileJson, FileText } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface HeaderProps {
  loading: boolean;
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  onRefresh: () => void;
  simulationMode: boolean;
  enclosure: string;
  updatedAt: string;
  onExportDiagnostics: (format: 'json' | 'text') => void;
}

export function Header({
  loading,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  simulationMode,
  enclosure,
  updatedAt,
  onExportDiagnostics,
}: HeaderProps) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('zh-CN');
    } catch {
      return isoString;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = (format: 'json' | 'text') => {
    onExportDiagnostics(format);
    setExportMenuOpen(false);
  };

  return (
    <header className="bg-dark-100 border-b border-dark-300 sticky top-0 z-50">
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
              <Server className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">SAS Backplane Manager</h1>
              <div className="flex items-center gap-2 text-sm text-dark-500">
                <span className="font-mono">{enclosure}</span>
                {simulationMode && (
                  <span className="px-2 py-0.5 bg-warning/20 text-warning text-xs rounded-full border border-warning/30">
                    模拟模式
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-dark-500">
            <Activity className="w-4 h-4" />
            <span>更新于 {formatTime(updatedAt)}</span>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => onAutoRefreshChange(e.target.checked)}
              className="w-4 h-4 accent-primary-500"
            />
            <span className="text-sm text-dark-500">自动刷新</span>
          </label>

          <div ref={exportRef} className="relative">
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-dark-200 hover:bg-dark-300 text-white rounded-lg transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              <span>导出日志</span>
            </button>

            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-dark-100 border border-dark-300 rounded-lg shadow-xl overflow-hidden z-50">
                <button
                  onClick={() => handleExport('json')}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-dark-200 text-left transition-colors"
                >
                  <FileJson className="w-4 h-4 text-primary-400" />
                  <div>
                    <p className="text-white text-sm">JSON 格式</p>
                    <p className="text-dark-500 text-xs">结构化数据</p>
                  </div>
                </button>
                <button
                  onClick={() => handleExport('text')}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-dark-200 text-left transition-colors"
                >
                  <FileText className="w-4 h-4 text-success" />
                  <div>
                    <p className="text-white text-sm">文本格式</p>
                    <p className="text-dark-500 text-xs">易读报告</p>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/50 text-white rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-primary-500/20"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>

          <button className="p-2 text-dark-500 hover:text-white hover:bg-dark-200 rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
