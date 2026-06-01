import { useState } from 'react';
import { ScrollText, Download, Trash2, ChevronDown, FileJson, FileText, Database } from 'lucide-react';
import type { ChangeEvent, MatchFilter, ExportFormat } from '../../shared/types.js';
import { EventCard } from './EventCard.js';
import { cn } from '../lib/utils.js';

interface EventLogPanelProps {
  events: ChangeEvent[];
  onClear: () => void;
  currentFilter: MatchFilter | null;
  currentToken: string | null;
}

const EXPORT_FORMATS: { value: ExportFormat; label: string; icon: any }[] = [
  { value: 'json', label: 'JSON', icon: FileJson },
  { value: 'csv', label: 'CSV', icon: FileText },
  { value: 'ndjson', label: 'NDJSON', icon: Database },
];

export function EventLogPanel({ events, onClear, currentFilter, currentToken }: EventLogPanelProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [applyFilterToExport, setApplyFilterToExport] = useState(true);
  const [resumeFromCurrent, setResumeFromCurrent] = useState(false);

  const exportEvents = async (format: ExportFormat) => {
    setIsExporting(true);
    setShowExportMenu(false);

    try {
      const body: any = { format };
      if (applyFilterToExport && currentFilter) {
        body.filter = currentFilter;
      }
      if (resumeFromCurrent && currentToken) {
        body.resumeAfter = currentToken;
      }

      const response = await fetch('/api/collection/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const count = response.headers.get('X-Export-Count') || events.length;
      const disposition = response.headers.get('Content-Disposition');
      let filename = `change-streams-${Date.now()}.${format}`;
      if (disposition) {
        const match = disposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      console.log(`Exported ${count} events as ${format}`);
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-green-400" />
          <h3 className="font-semibold text-zinc-100">事件日志</h3>
          <span className="text-xs text-zinc-500 font-mono">
            {events.length} 条记录
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={events.length === 0 || isExporting}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? '导出中...' : '导出'}
              <ChevronDown className="w-3 h-3" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="p-3 border-b border-zinc-700">
                  <div className="text-xs font-medium text-zinc-300 mb-2">导出选项</div>
                  <label className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer mb-1">
                    <input
                      type="checkbox"
                      checked={applyFilterToExport}
                      onChange={(e) => setApplyFilterToExport(e.target.checked)}
                      className="rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500"
                    />
                    应用当前过滤条件
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resumeFromCurrent}
                      onChange={(e) => setResumeFromCurrent(e.target.checked)}
                      className="rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500"
                    />
                    仅导出当前Token之后的事件
                  </label>
                </div>
                <div className="p-1">
                  <div className="text-xs text-zinc-500 px-2 py-1">选择格式</div>
                  {EXPORT_FORMATS.map((fmt) => {
                    const Icon = fmt.icon;
                    return (
                      <button
                        key={fmt.value}
                        onClick={() => exportEvents(fmt.value)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        <Icon className="w-3.5 h-3.5 text-zinc-400" />
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onClear}
            disabled={events.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="清空日志"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600">
            <ScrollText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">暂无事件记录</p>
          </div>
        ) : (
          events.map((event, index) => (
            <EventCard
              key={`${event._id._data}-log-${index}`}
              event={event}
            />
          ))
        )}
      </div>
    </div>
  );
}
