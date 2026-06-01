import React, { useCallback, useRef, useState } from 'react';
import { Upload, Package, AlertCircle, CheckCircle, X } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onUpload?: (file: File, onProgress: (progress: number) => void) => Promise<void>;
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  onUpload,
  accept = '.zip',
  maxSize = 50 * 1024 * 1024,
  disabled = false,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!file.name.endsWith('.zip') && file.type !== 'application/zip') {
      return '请上传ZIP格式的插件文件';
    }
    if (file.size > maxSize) {
      return `文件大小不能超过 ${maxSize / 1024 / 1024}MB`;
    }
    return null;
  };

  const handleFile = useCallback(
    (file: File) => {
      const error = validateFile(file);
      if (error) {
        setUploadError(error);
        return;
      }

      setSelectedFile(file);
      setUploadError(null);
      setUploadSuccess(false);
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !onUpload || isUploading) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      await onUpload(selectedFile, (progress) => {
        setUploadProgress(progress);
      });
      setUploadSuccess(true);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setUploadError(null);
    setUploadSuccess(false);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className={className}>
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
          ${isDragging 
            ? 'border-teal-500 bg-teal-500/10' 
            : uploadError 
            ? 'border-red-500/50 bg-red-500/5'
            : uploadSuccess
            ? 'border-green-500/50 bg-green-500/5'
            : 'border-slate-700 hover:border-slate-600 bg-slate-800/30'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        {selectedFile ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <Package className="w-10 h-10 text-teal-400" />
              <div className="text-left">
                <p className="font-medium text-white">{selectedFile.name}</p>
                <p className="text-sm text-slate-400">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="p-1 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isUploading && (
              <div className="w-full">
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-blue-500 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">{uploadProgress}%</p>
              </div>
            )}

            {uploadSuccess && (
              <div className="flex items-center justify-center gap-2 text-green-400">
                <CheckCircle className="w-5 h-5" />
                <span>上传成功！</span>
              </div>
            )}

            {uploadError && (
              <div className="flex items-center justify-center gap-2 text-red-400">
                <AlertCircle className="w-5 h-5" />
                <span>{uploadError}</span>
              </div>
            )}

            {onUpload && !isUploading && !uploadSuccess && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpload();
                }}
                disabled={disabled}
                className="px-6 py-2 bg-gradient-to-r from-teal-500 to-blue-500 text-white font-medium rounded-lg hover:from-teal-600 hover:to-blue-600 transition-all disabled:opacity-50"
              >
                开始上传
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto bg-slate-700/50 rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8 text-teal-400" />
            </div>
            <div>
              <p className="text-white font-medium">
                拖拽ZIP文件到此处，或点击选择
              </p>
              <p className="text-sm text-slate-500 mt-1">
                支持 .zip 格式，最大 50MB
              </p>
            </div>
            {uploadError && (
              <div className="flex items-center justify-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
