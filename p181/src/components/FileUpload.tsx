import React, { useCallback, useState } from 'react';
import { Upload, FileWarning, CheckCircle2, Settings, Database } from 'lucide-react';
import { useTLPStore } from '@/store/tlpStore';
import { cn } from '@/lib/utils';

export const FileUpload: React.FC = () => {
  const { loadFile, loading, parseResult, loadingProgress, parsedCount, useChunkedUpload, toggleChunkedUpload } = useTLPStore();
  const [isDragging, setIsDragging] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const handleFile = useCallback((file: File) => {
    loadFile(file);
  }, [loadFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">上传PCIe捕获文件</p>
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <Settings className="w-3 h-3" />
          选项
        </button>
      </div>

      {showOptions && (
        <div className="mb-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useChunkedUpload}
              onChange={toggleChunkedUpload}
              className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-xs text-slate-300">
              <Database className="inline w-3 h-3 mr-1" />
              大文件分块上传 {'(>10MB)'}
            </span>
          </label>
        </div>
      )}

      <label
        className={cn(
          "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200",
          isDragging
            ? "border-cyan-400 bg-cyan-500/10"
            : "border-slate-600 bg-slate-800/50 hover:border-cyan-500 hover:bg-slate-800",
          loading && "opacity-50 cursor-not-allowed"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          {parseResult ? (
            <CheckCircle2 className="w-8 h-8 mb-2 text-emerald-400" />
          ) : loading ? (
            <div className="relative w-8 h-8 mb-2">
              <Upload className="w-8 h-8 text-cyan-400 animate-pulse" />
            </div>
          ) : (
            <Upload className="w-8 h-8 mb-2 text-slate-400" />
          )}
          <p className="mb-2 text-sm text-slate-300">
            {parseResult ? (
              <span className="font-medium text-emerald-400">
                {parseResult.fileName} ({parseResult.tlps.length} TLPs)
              </span>
            ) : loading ? (
              <span className="text-cyan-400">
                正在解析... {loadingProgress}%
              </span>
            ) : (
              <>
                <span className="font-semibold text-cyan-400">点击上传</span> 或拖拽文件到此处
              </>
            )}
          </p>
          <p className="text-xs text-slate-500">
            支持 .hex, .txt, .bin, .dat 格式 (PCIeSnoop / 原始二进制)
          </p>
        </div>
        <input
          type="file"
          className="hidden"
          accept=".hex,.txt,.bin,.dat"
          onChange={handleInputChange}
          disabled={loading}
        />
      </label>

      {loading && (
        <div className="mt-3 space-y-2">
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>已解析: {parsedCount} TLPs</span>
            <span>{loadingProgress}%</span>
          </div>
        </div>
      )}
    </div>
  );
};
