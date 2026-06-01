import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useDataStore } from '../store/useDataStore';
import { useKalmanFilter } from '../hooks/useKalmanFilter';

export function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadStatus, errorMessage, tags } = useDataStore();
  const { uploadFile } = useKalmanFilter();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await uploadFile(files[0]);
      }
    },
    [uploadFile]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        await uploadFile(files[0]);
      }
    },
    [uploadFile]
  );

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const lastTag = tags[tags.length - 1];

  return (
    <div className="w-full">
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300 ${
          isDragging
            ? 'border-cyan-400 bg-cyan-500/10 scale-[1.01]'
            : uploadStatus === 'success'
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : uploadStatus === 'error'
            ? 'border-red-500/50 bg-red-500/5'
            : 'border-slate-600 hover:border-cyan-500/50 hover:bg-slate-800/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-3">
          {uploadStatus === 'success' && tags.length > 0 ? (
            <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
          ) : uploadStatus === 'error' ? (
            <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
          ) : (
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
                isDragging
                  ? 'bg-cyan-500/20'
                  : 'bg-slate-700/50 group-hover:bg-cyan-500/10'
              }`}
            >
              <Upload
                className={`w-7 h-7 transition-all duration-300 ${
                  isDragging ? 'text-cyan-400 scale-110' : 'text-slate-400'
                }`}
              />
            </div>
          )}

          <div>
            {uploadStatus === 'success' && tags.length > 0 ? (
              <>
                <p className="text-base font-medium text-emerald-400">数据已添加</p>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">
                    当前共 {tags.length} 个标签
                  </span>
                </div>
              </>
            ) : uploadStatus === 'error' ? (
              <>
                <p className="text-base font-medium text-red-400">上传失败</p>
                <p className="text-sm text-slate-400 mt-1">{errorMessage}</p>
              </>
            ) : (
              <>
                <p className="text-base font-medium text-slate-200">
                  拖拽文件到这里，或<span className="text-cyan-400">点击选择</span>
                </p>
                <p className="text-sm text-slate-400 mt-1">支持 CSV、JSON 格式，最大 10MB</p>
              </>
            )}
          </div>

          {uploadStatus === 'idle' && (
            <div className="flex gap-4 mt-2 text-xs text-slate-500">
              <span className="px-2 py-1 bg-slate-700/50 rounded">.csv</span>
              <span className="px-2 py-1 bg-slate-700/50 rounded">.json</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
