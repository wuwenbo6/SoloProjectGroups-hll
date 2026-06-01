import { useCallback, useRef } from 'react';
import { Upload, FileText, Loader2, Database } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useFileUpload } from '../hooks/useFileUpload';
import { formatFileSize } from '../utils/formatters';

const ALLOWED_EXTENSIONS = ['.ch10', '.irig', '.bin', '.dat'];

export function FileUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isDragging, isLoading, uploadProgress, error, parseResult, setIsDragging } = useAppStore();
  const { uploadFile, loadSampleData } = useFileUpload();

  const validateFile = (file: File): boolean => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return false;
    }
    return true;
  };

  const handleFile = useCallback((file: File) => {
    if (!validateFile(file)) {
      useAppStore.getState().setError(
        `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
      );
      return;
    }
    uploadFile(file);
  }, [uploadFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, [setIsDragging]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, [setIsDragging]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [setIsDragging, handleFile]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFile]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 cursor-pointer
          transition-all duration-300 ease-out
          ${isDragging 
            ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' 
            : 'border-slate-600 hover:border-slate-500 bg-slate-800/50 hover:bg-slate-800'
          }
          ${isLoading ? 'pointer-events-none opacity-70' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".ch10,.irig,.bin,.dat"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          {isLoading ? (
            <>
              <div className="relative">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-mono text-slate-400">
                    {uploadProgress}%
                  </span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-slate-300 font-medium">
                  Processing file...
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Parsing IRIG 106 Chapter 10 data
                </p>
              </div>
              <div className="w-full max-w-xs h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <div className={`
                w-16 h-16 rounded-full flex items-center justify-center
                transition-all duration-300
                ${isDragging ? 'bg-blue-500/20' : 'bg-slate-700'}
              `}>
                <Upload className={`w-8 h-8 transition-colors duration-300 ${isDragging ? 'text-blue-400' : 'text-slate-400'}`} />
              </div>
              <div className="text-center">
                <p className="text-slate-200 font-semibold text-lg">
                  Drop IRIG 106 file here
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  or <span className="text-blue-400 hover:text-blue-300">browse to select</span>
                </p>
                <p className="text-xs text-slate-600 mt-2">
                  Supports .ch10, .irig, .bin, .dat files
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!parseResult && !isLoading && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            loadSampleData();
          }}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 px-4 
            bg-slate-700/50 hover:bg-slate-700 border border-slate-600 
            rounded-lg text-slate-300 transition-all duration-200
            hover:border-slate-500"
        >
          <Database className="w-4 h-4" />
          <span className="text-sm">Load Sample Data</span>
        </button>
      )}

      {parseResult && (
        <div className="mt-4 p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-slate-200 font-medium truncate">
                {parseResult.fileName}
              </p>
              <p className="text-sm text-slate-500">
                {formatFileSize(parseResult.fileSize)} · {parseResult.totalPackets} packets
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Version {parseResult.fileHeader.versionMajor}.{parseResult.fileHeader.versionMinor}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
