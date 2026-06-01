import { useState, useRef } from 'react';
import { X, Upload, FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClientMessage } from '../../shared/types';

interface FileUploadDialogProps {
  open: boolean;
  onClose: () => void;
  send: (msg: ClientMessage) => void;
  isConnected: boolean;
  uploadProgress: number;
  uploadStatus: 'idle' | 'uploading' | 'complete' | 'error';
  uploadError?: string;
}

export default function FileUploadDialog({
  open,
  onClose,
  send,
  isConnected,
  uploadProgress,
  uploadStatus,
  uploadError,
}: FileUploadDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetFilename, setTargetFilename] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setTargetFilename(file.name);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleUpload = async () => {
    if (!selectedFile || !isConnected) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const filename = targetFilename || selectedFile.name;
      send({
        type: 'file_upload',
        file: {
          filename,
          content,
        },
      });
    };
    reader.readAsText(selectedFile);
  };

  const handleClose = () => {
    if (uploadStatus !== 'uploading') {
      setSelectedFile(null);
      setTargetFilename('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-terminal-surface border border-terminal-border rounded-lg w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border">
          <div className="flex items-center gap-2">
            <FileUp size={18} className="text-terminal-fg" />
            <h3 className="text-sm font-semibold text-gray-200">上传文件到设备</h3>
          </div>
          <button
            onClick={handleClose}
            disabled={uploadStatus === 'uploading'}
            className="text-gray-400 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!isConnected && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              <span className="text-xs text-red-400">请先连接设备</span>
            </div>
          )}

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
              dragActive
                ? 'border-terminal-fg bg-terminal-fg/5'
                : 'border-terminal-border hover:border-terminal-fg/50 hover:bg-terminal-bg/30'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".py,.txt,.json,.csv"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
            <Upload size={32} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-400">
              拖放文件到此处，或点击选择
            </p>
            <p className="text-xs text-gray-500 mt-1">
              支持 .py, .txt, .json, .csv 文件
            </p>
          </div>

          {selectedFile && (
            <div className="bg-terminal-bg/50 border border-terminal-border rounded-md p-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {Math.round(selectedFile.size / 1024)} KB
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setTargetFilename('');
                  }}
                  disabled={uploadStatus === 'uploading'}
                  className="text-gray-400 hover:text-red-400 disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">目标文件名</label>
                <input
                  type="text"
                  value={targetFilename}
                  onChange={(e) => setTargetFilename(e.target.value)}
                  disabled={uploadStatus === 'uploading'}
                  className="w-full bg-terminal-bg border border-terminal-border rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-terminal-fg/50 disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {uploadStatus === 'uploading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">上传中...</span>
                <span className="text-terminal-fg">{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-terminal-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-terminal-fg transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {uploadStatus === 'complete' && (
            <div className="bg-terminal-fg/10 border border-terminal-fg/20 rounded-md px-3 py-2">
              <span className="text-xs text-terminal-fg">✓ 文件上传成功</span>
            </div>
          )}

          {uploadStatus === 'error' && uploadError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              <span className="text-xs text-red-400">上传失败: {uploadError}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleClose}
              disabled={uploadStatus === 'uploading'}
              className="flex-1 py-2 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-50"
            >
              {uploadStatus === 'complete' || uploadStatus === 'error' ? '关闭' : '取消'}
            </button>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !isConnected || uploadStatus === 'uploading'}
              className="flex-1 py-2 rounded-md text-sm font-semibold bg-terminal-fg/15 text-terminal-fg border border-terminal-fg/30 hover:bg-terminal-fg/25 hover:shadow-[0_0_20px_rgba(0,255,136,0.15)] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              {uploadStatus === 'uploading' ? '上传中...' : '上传'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
