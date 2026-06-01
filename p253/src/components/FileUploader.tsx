import { useCallback, useRef, useState } from "react";
import { Upload, FileVideo, X } from "lucide-react";

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export default function FileUploader({ onFileSelect, disabled }: FileUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".ts")) {
        return;
      }
      setSelectedFile(file);
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && !selectedFile && inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer
          transition-all duration-300 ease-out
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${
            isDragOver
              ? "border-[#00d4aa] bg-[#00d4aa]/10 shadow-[0_0_30px_rgba(0,212,170,0.15)]"
              : selectedFile
              ? "border-[#00d4aa]/40 bg-[#00d4aa]/5"
              : "border-[#3a3f55] bg-[#232839]/50 hover:border-[#00d4aa]/50 hover:bg-[#00d4aa]/5"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".ts"
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        {selectedFile ? (
          <div className="flex items-center justify-center gap-3">
            <FileVideo className="w-8 h-8 text-[#00d4aa]" />
            <div className="text-left">
              <p className="text-white font-mono text-sm truncate max-w-[200px]">{selectedFile.name}</p>
              <p className="text-[#8b8fa3] text-xs mt-0.5">{formatSize(selectedFile.size)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="ml-2 p-1 rounded-full hover:bg-[#3a3f55] transition-colors"
            >
              <X className="w-4 h-4 text-[#8b8fa3]" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="p-4 rounded-2xl bg-[#2a2f42] border border-[#3a3f55]">
                <Upload className="w-8 h-8 text-[#00d4aa]" />
              </div>
            </div>
            <div>
              <p className="text-white text-sm font-medium">拖拽 .ts 文件到此处</p>
              <p className="text-[#8b8fa3] text-xs mt-1">或点击选择文件</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
