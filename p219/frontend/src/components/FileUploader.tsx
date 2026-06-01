import React, { useState, useCallback } from 'react';

interface FileUploaderProps {
  onUpload: (file: File) => Promise<void>;
  uploadedFile: { name: string; size: number } | null;
  isUploading: boolean;
  disabled?: boolean;
}

export function FileUploader({ onUpload, uploadedFile, isUploading, disabled }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

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
    if (files.length > 0 && files[0].name.endsWith('.hex')) {
      onUpload(files[0]);
    }
  }, [onUpload]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUpload(files[0]);
    }
  }, [onUpload]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-300">
        HEX 文件
      </label>
      
      {!uploadedFile ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer
            ${isDragging 
              ? 'border-accent-green bg-accent-green/10' 
              : 'border-dark-border bg-dark-card hover:border-accent-blue/50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onDragOver={!disabled ? handleDragOver : undefined}
          onDragLeave={!disabled ? handleDragLeave : undefined}
          onDrop={!disabled ? handleDrop : undefined}
        >
          <input
            type="file"
            accept=".hex"
            onChange={handleFileChange}
            disabled={disabled || isUploading}
            className="hidden"
            id="hex-file-input"
          />
          <label 
            htmlFor="hex-file-input" 
            className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-dark-border flex items-center justify-center">
                <svg className="w-8 h-8 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">
                  {isUploading ? '上传中...' : '拖拽 HEX 文件到此处'}
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  或点击选择文件
                </p>
              </div>
              <p className="text-gray-600 text-xs">
                仅支持 .hex 格式文件
              </p>
            </div>
          </label>
        </div>
      ) : (
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-accent-green/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium truncate max-w-[200px]">
                  {uploadedFile.name}
                </p>
                <p className="text-gray-500 text-sm">
                  {formatFileSize(uploadedFile.size)}
                </p>
              </div>
            </div>
            {!disabled && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  const input = document.getElementById('hex-file-input') as HTMLInputElement;
                  if (input) input.value = '';
                  window.location.reload();
                }}
                className="p-2 text-gray-400 hover:text-accent-red transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
