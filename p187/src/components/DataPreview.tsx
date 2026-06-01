import { Table2 } from 'lucide-react';
import { useDataStore } from '../store/useDataStore';

export function DataPreview() {
  const { tags, activeTagId } = useDataStore();

  const activeTag = tags.find((t) => t.tagId === activeTagId);
  const displayData = activeTag?.originalData.slice(0, 10) || [];
  const hasFiltered = activeTag?.filteredData.length > 0;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  };

  if (tags.length === 0 || !activeTag) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
        <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-cyan-400 rounded-full"></span>
          数据预览
        </h3>
        <div className="h-48 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <Table2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>上传数据后预览</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
      <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-cyan-400 rounded-full"></span>
        数据预览
        <div className="flex items-center gap-2 ml-auto">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: activeTag.color }}
          />
          <span className="text-sm font-normal text-slate-400">
            {activeTag.tagName} · 共 {activeTag.originalData.length} 条
          </span>
        </div>
      </h3>
      <div className="overflow-hidden rounded-lg border border-slate-700">
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-400 w-12">#</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">时间戳</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">原始距离 (m)</th>
                {hasFiltered && (
                  <th className="px-4 py-3 text-left font-medium text-cyan-400">滤波后 (m)</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {displayData.map((point, index) => (
                <tr key={point.timestamp} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-2 text-slate-500 font-mono">{index + 1}</td>
                  <td className="px-4 py-2 text-slate-300 font-mono text-xs">
                    {formatTime(point.timestamp)}
                  </td>
                  <td className="px-4 py-2 text-slate-300 font-mono">
                    {point.distance.toFixed(3)}
                  </td>
                  {hasFiltered && activeTag.filteredData[index] && (
                    <td className="px-4 py-2 text-cyan-400 font-mono">
                      {activeTag.filteredData[index].distance.toFixed(3)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {activeTag.originalData.length > 10 && (
        <p className="text-xs text-slate-500 mt-2 text-center">
          仅显示前 10 条数据，共 {activeTag.originalData.length} 条
        </p>
      )}
    </div>
  );
}
