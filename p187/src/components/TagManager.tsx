import { X, Eye, EyeOff, Download, Settings } from 'lucide-react';
import { useDataStore } from '../store/useDataStore';

export function TagManager() {
  const { tags, activeTagId, setActiveTag, removeTag, showOriginal, showFiltered, toggleShowOriginal, toggleShowFiltered, exportParams } = useDataStore();

  const handleExportParams = () => {
    const paramsJson = exportParams();
    const blob = new Blob([paramsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kalman-params-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <span className="w-1 h-4 bg-cyan-400 rounded-full"></span>
          数据标签 ({tags.length})
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleShowOriginal}
            className={`p-1.5 rounded-lg transition-colors ${
              showOriginal ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-700 text-slate-500'
            }`}
            title={showOriginal ? '隐藏原始数据' : '显示原始数据'}
          >
            {showOriginal ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleShowFiltered}
            className={`p-1.5 rounded-lg transition-colors ${
              showFiltered ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-500'
            }`}
            title={showFiltered ? '隐藏滤波数据' : '显示滤波数据'}
          >
            {showFiltered ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={handleExportParams}
            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-cyan-400 transition-colors"
            title="导出滤波参数"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {tags.map((tag) => (
          <div
            key={tag.tagId}
            onClick={() => setActiveTag(tag.tagId)}
            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
              activeTagId === tag.tagId
                ? 'bg-slate-700/50 border border-cyan-500/50'
                : 'bg-slate-900/30 border border-transparent hover:bg-slate-700/30'
            }`}
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{tag.tagName}</p>
              <p className="text-xs text-slate-500">
                {tag.originalData.length} 条数据
                {tag.filteredData.length > 0 && (
                  <span className="text-emerald-400 ml-2">✓ 已滤波</span>
                )}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag.tagId);
              }}
              className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
              title="删除标签"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
