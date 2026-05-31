import React, { useState, useCallback } from 'react';
import { Upload, File, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { uploadPCD } from '../services/api';
import { UploadedFile } from '../types';

interface FileUploadProps {
  onUploadComplete: (file: UploadedFile) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUploadComplete }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pcd') && !file.name.toLowerCase().endsWith('.bin')) {
      setUploadError('仅支持 .pcd 和 .bin 格式的点云文件');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const uploadedFile = await uploadPCD(file);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 2000);
      onUploadComplete(uploadedFile);
    } catch (error: any) {
      setUploadError(error.response?.data?.error || '上传失败，请重试');
    } finally {
      setIsUploading(false);
    }
  }, [onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-6 transition-all duration-300 ${
          isDragOver
            ? 'border-accent-blue bg-accent-blue/10 scale-[1.02]'
            : 'border-dark-border bg-dark-surface/50 hover:border-gray-600'
        }`}
      >
        <input
          type="file"
          accept=".pcd,.bin"
          onChange={handleFileChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isUploading}
        />
        
        <div className="flex flex-col items-center gap-3 text-center">
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-10 h-10 text-accent-blue animate-spin" />
              <span className="text-gray-300">正在上传...</span>
            </div>
          ) : uploadSuccess ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <span className="text-green-400">上传成功！</span>
            </div>
          ) : (
            <>
              <div className={`p-3 rounded-full transition-colors ${
                isDragOver ? 'bg-accent-blue/20' : 'bg-dark-border'
              }`}>
                <Upload className={`w-6 h-6 ${isDragOver ? 'text-accent-blue' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-gray-200 font-medium">
                  拖放点云文件到此处
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  或点击选择文件（支持 .pcd, .bin 格式）
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <File className="w-3 h-3" />
                <span>最大 100MB</span>
              </div>
            </>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-3 py-2 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
