import React, { useCallback, useState } from 'react';
import { Upload, X, FileText, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileUploadProps {
  label: string;
  accept: string;
  description: string;
  onFileSelected: (file: File) => void;
  onFileCleared?: () => void;
  selectedFile?: File | null;
  disabled?: boolean;
  showPreview?: boolean;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  label,
  accept,
  description,
  onFileSelected,
  onFileCleared,
  selectedFile,
  disabled = false,
  showPreview = true,
  className,
}) => {
  const shouldShowSelected = showPreview && selectedFile;
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    
    if (disabled) return;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const acceptedTypes = accept.split(',').map(t => t.trim().toLowerCase());
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (acceptedTypes.includes(fileExt) || acceptedTypes.includes(file.type.toLowerCase())) {
        onFileSelected(file);
      } else {
        setError(`Invalid file type. Expected: ${accept}`);
      }
    }
  }, [accept, disabled, onFileSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelected(files[0]);
    }
  }, [onFileSelected]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setError(null);
    if (onFileCleared) {
      onFileCleared();
    }
  }, [onFileCleared]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label && <label className="block text-sm font-medium text-gray-300">{label}</label>}
      
      {shouldShowSelected ? (
        <div className="flex items-center gap-3 p-4 bg-navy-700/50 border border-cyber-blue/30 rounded-lg backdrop-blur-sm">
          <div className="p-2 bg-cyber-blue/20 rounded-lg">
            <FileText className="w-6 h-6 text-cyber-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{selectedFile.name}</p>
            <p className="text-xs text-gray-400">{formatFileSize(selectedFile.size)}</p>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-cyber-green" />
            {!disabled && (
              <button
                onClick={handleClear}
                className="p-1 hover:bg-red-500/20 rounded transition-colors"
              >
                <X className="w-4 h-4 text-red-400" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 cursor-pointer overflow-hidden',
            isDragging
              ? 'border-cyber-blue bg-cyber-blue/10'
              : 'border-gray-600 hover:border-cyber-blue/50 hover:bg-navy-700/30',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-red-500'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && document.getElementById(`file-input-${label}`)?.click()}
        >
          {isDragging && (
            <div className="absolute inset-0 bg-gradient-to-b from-cyber-blue/10 to-transparent pointer-events-none">
              <div className="absolute inset-x-0 h-1 bg-cyber-blue/50 animate-scan" />
            </div>
          )}
          
          <input
            id={`file-input-${label}`}
            type="file"
            accept={accept}
            onChange={handleFileInput}
            className="hidden"
            disabled={disabled}
          />
          
          <div className="flex flex-col items-center gap-3">
            <div className={cn(
              'p-3 rounded-full transition-all duration-300',
              isDragging ? 'bg-cyber-blue/20 scale-110' : 'bg-navy-600/50'
            )}>
              <Upload className={cn(
                'w-8 h-8 transition-colors',
                isDragging ? 'text-cyber-blue' : 'text-gray-400'
              )} />
            </div>
            <div>
              <p className="text-sm text-gray-300">
                {isDragging ? 'Drop file here' : 'Click to upload or drag and drop'}
              </p>
              <p className="text-xs text-gray-500 mt-1">{description}</p>
            </div>
          </div>
        </div>
      )}
      
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
};

export default FileUpload;
