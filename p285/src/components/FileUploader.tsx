import { useCallback, useState } from 'react';
import { Upload, File, AlertCircle } from 'lucide-react';
import { useParserStore } from '../store/parserStore';
import { cn } from '../lib/utils';

export default function FileUploader() {
  const { parse, loading, fileName, error, result } = useParserStore();
  const [dragActive, setDragActive] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      parse(file);
    },
    [parse]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all duration-300',
          dragActive
            ? 'border-[#00E5CC] bg-[#00E5CC]/5 shadow-[0_0_30px_rgba(0,229,204,0.15)]'
            : 'border-slate-600 bg-slate-800/50 hover:border-slate-500',
          loading && 'pointer-events-none opacity-60'
        )}
      >
        <input
          type="file"
          accept=".bin,.cap,.pcap,.raw,.dat"
          onChange={handleChange}
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={loading}
        />
        <div
          className={cn(
            'mb-3 rounded-full p-3 transition-all duration-300',
            dragActive ? 'bg-[#00E5CC]/20' : 'bg-slate-700/50'
          )}
        >
          <Upload
            className={cn(
              'h-6 w-6 transition-colors',
              dragActive ? 'text-[#00E5CC]' : 'text-slate-400'
            )}
          />
        </div>
        <p className="mb-1 text-sm font-medium text-slate-200">
          {dragActive ? '释放文件以上传' : '拖拽文件到此处或点击上传'}
        </p>
        <p className="text-xs text-slate-500">支持 .bin .cap .pcap .raw .dat 格式</p>
      </div>

      {fileName && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-800/80 px-3 py-2">
          <File className="h-4 w-4 text-[#00E5CC]" />
          <span className="truncate text-sm text-slate-300">{fileName}</span>
          {loading && (
            <div className="ml-auto">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#00E5CC] border-t-transparent" />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {result && result.success && (
        <div className="rounded-lg border border-[#00E5CC]/20 bg-[#00E5CC]/5 px-3 py-2">
          <span className="text-sm text-[#00E5CC]">
            解析成功：共 {result.frames.length} 个帧
          </span>
        </div>
      )}
    </div>
  );
}
