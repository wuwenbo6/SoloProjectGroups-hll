import React from 'react';
import { UploadedFile } from '../types';
import { Trash2, File, Clock, Database, Play, CheckCircle, Loader2, XCircle } from 'lucide-react';

interface FileListProps {
  files: UploadedFile[];
  selectedFileId: string | null;
  onSelect: (file: UploadedFile) => void;
  onDelete: (fileId: string) => void;
  onDetect: (fileId: string) => void;
  isProcessing: boolean;
}

const FileList: React.FC<FileListProps> = ({
  files,
  selectedFileId,
  onSelect,
  onDelete,
  onDetect,
  isProcessing,
}) => {
  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="w-3.5 h-3.5 text-accent-blue animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
      case 'error':
        return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  const getStatusText = (status: UploadedFile['status']) => {
    switch (status) {
      case 'processing':
        return '处理中';
      case 'completed':
        return '已完成';
      case 'error':
        return '失败';
      default:
        return '已上传';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500">
        <Database className="w-10 h-10 mb-2 opacity-50" />
        <p className="text-sm">暂无上传文件</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {files.map((file, index) => (
        <div
          key={file.id}
          className={`group p-3 rounded-lg border transition-all ${
            selectedFileId === file.id
              ? 'bg-accent-blue/10 border-accent-blue/50'
              : 'bg-dark-surface/50 border-dark-border hover:border-gray-600'
          }`}
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-start gap-3">
            <button
              onClick={() => onSelect(file)}
              className="flex-1 text-left"
            >
              <div className="flex items-center gap-2">
                <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm font-medium truncate text-gray-200">
                  {file.file_name}
                </span>
              </div>
              
              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                <span>{formatFileSize(file.file_size)}</span>
                <span>•</span>
                <span>{file.point_count.toLocaleString()} 点</span>
                <span className="flex items-center gap-1">
                  {getStatusIcon(file.status)}
                  {getStatusText(file.status)}
                </span>
              </div>
            </button>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {file.status === 'uploaded' && (
                <button
                  onClick={() => onDetect(file.id)}
                  disabled={isProcessing}
                  className="p-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                  title="运行检测"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onDelete(file.id)}
                className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FileList;
