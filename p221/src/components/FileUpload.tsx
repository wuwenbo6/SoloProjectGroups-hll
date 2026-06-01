import React, { useCallback, useState } from 'react';
import { Upload, FileVideo, X, AlertCircle, Zap } from 'lucide-react';
import { formatBytes } from '../utils/h265Parser';

interface ParseProgress {
  progress: number;
  processed: number;
  total: number;
}

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  isParsing: boolean;
  error: string | null;
  fileName: string | null;
  fileSize: number | null;
  parseProgress?: ParseProgress | null;
  isStreaming?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileUpload,
  isParsing,
  error,
  fileName,
  fileSize,
  parseProgress,
  isStreaming,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        onFileUpload(file);
      }
    },
    [onFileUpload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        onFileUpload(file);
      }
    },
    [onFileUpload]
  );

  return (
    <div className="w-full">
      <label
        className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10 scale-[1.02]'
            : fileName
            ? 'border-green-500/50 bg-green-500/5'
            : 'border-gray-600 bg-gray-800/50 hover:border-blue-400 hover:bg-gray-800'
        } ${isParsing ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="hidden"
          accept=".hevc,.265,h265"
          onChange={handleFileSelect}
          disabled={isParsing}
        />

        {isParsing ? (
          <div className="flex flex-col items-center gap-3 w-full px-4">
            {isStreaming && (
              <div className="flex items-center gap-2 px-3 py-1 bg-cyan-500/20 rounded-full">
                <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span className="text-cyan-400 text-xs font-medium">流式分块解析中</span>
              </div>
            )}
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-center w-full">
              <span className="text-gray-300 text-sm">
                {isStreaming ? '正在分块解析文件...' : '正在解析文件...'}
              </span>
              {parseProgress && (
                <div className="mt-3 w-full">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300 ease-out"
                      style={{ width: `${parseProgress.progress * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    {formatBytes(parseProgress.processed)} / {formatBytes(parseProgress.total)}
                    <span className="ml-2 text-blue-400">
                      ({Math.round(parseProgress.progress * 100)}%)
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : fileName ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
              <FileVideo className="w-7 h-7 text-green-400" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium">{fileName}</p>
              <p className="text-gray-400 text-sm">{formatBytes(fileSize || 0)}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                isDragging ? 'bg-blue-500/20' : 'bg-gray-700/50'
              }`}
            >
              <Upload
                className={`w-7 h-7 transition-colors ${
                  isDragging ? 'text-blue-400' : 'text-gray-400'
                }`}
              />
            </div>
            <div className="text-center">
              <p className="text-white font-medium">拖拽 H.265 裸流文件到此处</p>
              <p className="text-gray-400 text-sm mt-1">
                或点击选择文件（支持 .hevc, .265 格式）
              </p>
            </div>
          </div>
        )}
      </label>

      {error && (
        <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}
    </div>
  );
};
