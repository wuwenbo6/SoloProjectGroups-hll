import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useBSDLStore } from '../hooks/useBSDLStore';
import { parseBSDL, validateBSDL, getSampleBSDL } from '../parser/bsdlParser';

interface FileUploadProps {
  onUploadComplete?: () => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUploadComplete }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  
  const { addChip, setParsingErrors, isLoading, setLoading } = useBSDLStore();

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.bsdl') && !file.name.toLowerCase().endsWith('.bsd')) {
      setUploadStatus('error');
      setStatusMessage('请上传 .bsdl 或 .bsd 格式的文件');
      return;
    }

    setLoading(true);
    setUploadStatus('uploading');
    setStatusMessage('正在解析文件...');

    try {
      const content = await file.text();
      
      if (!validateBSDL(content)) {
        setUploadStatus('error');
        setStatusMessage('无效的BSDL文件格式');
        setLoading(false);
        return;
      }

      const result = parseBSDL(content, file.name);
      setParsingErrors(result.errors);

      if (result.success && result.chip) {
        addChip(result.chip);
        setUploadStatus('success');
        setStatusMessage(`成功解析: ${result.chip.name}`);
        onUploadComplete?.();
      } else {
        setUploadStatus('error');
        setStatusMessage('解析失败，请检查文件格式');
      }
    } catch (error) {
      setUploadStatus('error');
      setStatusMessage('文件读取失败');
    } finally {
      setLoading(false);
      setTimeout(() => {
        setUploadStatus('idle');
        setStatusMessage('');
      }, 3000);
    }
  }, [addChip, setParsingErrors, setLoading, onUploadComplete]);

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
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      processFile(files[0]);
    }
    e.target.value = '';
  }, [processFile]);

  const handleLoadSample = useCallback(() => {
    setLoading(true);
    setUploadStatus('uploading');
    setStatusMessage('正在加载示例文件...');

    setTimeout(() => {
      const sampleContent = getSampleBSDL();
      const result = parseBSDL(sampleContent, 'sample_device.bsdl');
      setParsingErrors(result.errors);

      if (result.success && result.chip) {
        addChip(result.chip);
        setUploadStatus('success');
        setStatusMessage(`成功加载示例: ${result.chip.name}`);
        onUploadComplete?.();
      }
      
      setLoading(false);
      setTimeout(() => {
        setUploadStatus('idle');
        setStatusMessage('');
      }, 3000);
    }, 500);
  }, [addChip, setParsingErrors, setLoading, onUploadComplete]);

  return (
    <div className="w-full">
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 cursor-pointer
          ${isDragging 
            ? 'border-cyan-400 bg-cyan-500/10 scale-[1.02]' 
            : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'
          }
          ${uploadStatus === 'success' ? 'border-emerald-500 bg-emerald-500/10' : ''}
          ${uploadStatus === 'error' ? 'border-red-500 bg-red-500/10' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".bsdl,.bsd"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isLoading}
        />
        
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className={`p-4 rounded-full transition-all duration-300
            ${isDragging ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-400'}
            ${uploadStatus === 'success' ? 'bg-emerald-500/20 text-emerald-400' : ''}
            ${uploadStatus === 'error' ? 'bg-red-500/20 text-red-400' : ''}
          `}>
            {isLoading ? (
              <Loader2 className="w-10 h-10 animate-spin" />
            ) : uploadStatus === 'success' ? (
              <CheckCircle className="w-10 h-10" />
            ) : uploadStatus === 'error' ? (
              <AlertCircle className="w-10 h-10" />
            ) : (
              <Upload className="w-10 h-10" />
            )}
          </div>
          
          <div className="text-center">
            <p className="text-lg font-medium text-slate-200">
              {isDragging ? '释放以上传文件' : '拖拽BSDL文件到此处'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              或点击选择文件
            </p>
          </div>

          {statusMessage && (
            <p className={`text-sm font-medium
              ${uploadStatus === 'success' ? 'text-emerald-400' : ''}
              ${uploadStatus === 'error' ? 'text-red-400' : ''}
              ${uploadStatus === 'uploading' ? 'text-cyan-400' : ''}
            `}>
              {statusMessage}
            </p>
          )}

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FileText className="w-4 h-4" />
            <span>支持 .bsdl, .bsd 格式</span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-center">
        <button
          onClick={handleLoadSample}
          disabled={isLoading}
          className="px-4 py-2 text-sm text-cyan-400 hover:text-cyan-300 
                     border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10
                     transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          加载示例文件
        </button>
      </div>
    </div>
  );
};
