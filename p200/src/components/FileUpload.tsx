import React, { useCallback, useState } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  error?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, isLoading, error }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
      const file = files[0];
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  return (
    <div className="w-full">
      <div
        className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300 cursor-pointer ${
          isDragging
            ? "border-accent bg-accent/10"
            : "border-gray-600 hover:border-accent/50 hover:bg-card/50"
        } ${isLoading ? "opacity-60 pointer-events-none" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileInput}
          disabled={isLoading}
        />
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center animate-pulse-slow">
              <Upload className="w-8 h-8 text-accent" />
            </div>
            <p className="text-lg font-medium text-accent">正在上传...</p>
            <p className="text-sm text-gray-400">请稍候</p>
          </div>
        ) : selectedFile ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
              <FileText className="w-8 h-8 text-accent" />
            </div>
            <p className="text-lg font-medium text-white">{selectedFile.name}</p>
            <p className="text-sm text-gray-400">
              {(selectedFile.size / 1024).toFixed(2)} KB
            </p>
            <p className="text-sm text-accent mt-2">点击或拖拽重新选择文件</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-gray-700/50 flex items-center justify-center">
              <Upload className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-lg font-medium text-white">拖拽 CSV 文件到此处</p>
            <p className="text-sm text-gray-400">或点击选择文件</p>
            <p className="text-xs text-gray-500 mt-2">支持 .csv 格式</p>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/30 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
          <span className="text-sm text-warning">{error}</span>
        </div>
      )}
    </div>
  );
};
