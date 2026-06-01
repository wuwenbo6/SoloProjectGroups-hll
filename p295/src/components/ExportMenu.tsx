import { Download, ChevronDown, FileJson, FileText } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useLogStore } from '@/stores/logStore';

export default function ExportMenu() {
  const { query } = useLogStore();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const doExport = (options: { mapped: boolean; includeRaw: boolean; rawOnly: boolean }) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('mapped', String(options.mapped));
    params.set('include_raw', String(options.includeRaw));
    params.set('raw_only', String(options.rawOnly));

    const url = `/api/logs/export/jsonl?${params}`;
    const a = document.createElement('a');
    a.href = url;
    a.click();
    setOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-gelf-surface border border-gelf-border text-gelf-text rounded-lg text-sm font-medium hover:border-gelf-accent/50 hover:text-gelf-accent transition-all duration-300"
      >
        <Download size={16} />
        导出
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-gelf-surface border border-gelf-border rounded-lg shadow-xl shadow-black/50 z-50 overflow-hidden animate-fade-in">
          <div className="px-4 py-2 border-b border-gelf-border">
            <div className="text-xs text-gelf-muted font-mono">
              {query ? `筛选: "${query}"` : '全部日志'}
            </div>
          </div>

          <button
            onClick={() => doExport({ mapped: true, includeRaw: true, rawOnly: false })}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gelf-accent/10 transition-colors border-b border-gelf-border/50"
          >
            <FileJson size={18} className="text-gelf-accent flex-shrink-0" />
            <div>
              <div className="text-sm text-gelf-text font-medium">JSONL（含字段映射）</div>
              <div className="text-xs text-gelf-muted">
                包含 level_name、timestamp_iso 等映射字段
              </div>
            </div>
          </button>

          <button
            onClick={() => doExport({ mapped: false, includeRaw: true, rawOnly: false })}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gelf-accent/10 transition-colors border-b border-gelf-border/50"
          >
            <FileJson size={18} className="text-gelf-success flex-shrink-0" />
            <div>
              <div className="text-sm text-gelf-text font-medium">JSONL（原始格式）</div>
              <div className="text-xs text-gelf-muted">
                仅原始字段，无额外映射
              </div>
            </div>
          </button>

          <button
            onClick={() => doExport({ mapped: false, includeRaw: false, rawOnly: false })}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gelf-accent/10 transition-colors border-b border-gelf-border/50"
          >
            <FileText size={18} className="text-gelf-warn flex-shrink-0" />
            <div>
              <div className="text-sm text-gelf-text font-medium">JSONL（不含 _raw）</div>
              <div className="text-xs text-gelf-muted">
                精简格式，排除原始 JSON 字符串
              </div>
            </div>
          </button>

          <button
            onClick={() => doExport({ mapped: false, includeRaw: false, rawOnly: true })}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gelf-accent/10 transition-colors"
          >
            <FileJson size={18} className="text-purple-400 flex-shrink-0" />
            <div>
              <div className="text-sm text-gelf-text font-medium">JSONL（仅原始 GELF）</div>
              <div className="text-xs text-gelf-muted">
                仅导出原始收到的 GELF JSON 每行一条
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
