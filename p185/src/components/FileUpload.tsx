import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Play, AlertCircle, Loader2 } from 'lucide-react';
import { parseAuditLog, streamParseAuditLog } from '@/utils/parser';
import { sampleAuditLog } from '@/data/sampleData';
import { useLogStore } from '@/store/useLogStore';

export function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    setParseResult,
    setLoading,
    error,
    setError,
    clearData,
    progress,
    setProgress,
  } = useLogStore();

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.log') && !file.name.endsWith('.txt')) {
      setError('请上传 .log 或 .txt 格式的文件');
      return;
    }

    setLoading(true);
    setError(null);
    setFileName(file.name);
    clearData();

    try {
      const generator = streamParseAuditLog(file, (p) => {
        setProgress(p);
      });

      let result;
      
      while (true) {
        const { value, done } = await generator.next();
        if (done) {
          result = value;
          break;
        }
      }

      if (result && result.records.length === 0) {
        setError('未找到有效的 AVC 拒绝记录');
        setParseResult(null);
      } else {
        setParseResult(result);
      }
    } catch (err) {
      setError('解析文件时出错，请检查文件格式');
      setParseResult(null);
    } finally {
      setLoading(false);
    }
  }, [setParseResult, setLoading, setError, clearData, setProgress]);

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
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const loadSampleData = useCallback(() => {
    clearData();
    setLoading(true);
    setFileName('示例数据');
    setTimeout(() => {
      const result = parseAuditLog(sampleAuditLog);
      setProgress({
        processedLines: sampleAuditLog.split('\n').length,
        foundRecords: result.records.length,
        isComplete: true,
      });
      setParseResult(result);
      setLoading(false);
    }, 500);
  }, [clearData, setLoading, setParseResult, setProgress]);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <Upload className="w-5 h-5 text-cyan-500" />
        上传日志文件
      </h2>
      
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-cyan-500 bg-cyan-50'
            : 'border-slate-300 hover:border-cyan-400 hover:bg-slate-50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".log,.txt"
          onChange={handleFileInput}
          className="hidden"
        />
        
        <div className="flex flex-col items-center gap-3">
          <div className={`p-4 rounded-full transition-colors ${
            isDragging ? 'bg-cyan-100' : 'bg-slate-100'
          }`}>
            <FileText className={`w-10 h-10 ${isDragging ? 'text-cyan-500' : 'text-slate-400'}`} />
          </div>
          <div>
            <p className="text-slate-700 font-medium">
              拖拽文件到此处，或点击选择文件
            </p>
            <p className="text-slate-400 text-sm mt-1">
              支持 .log 和 .txt 格式的 audit.log 文件
            </p>
          </div>
          {fileName && (
            <p className="text-cyan-600 text-sm font-medium mt-2">
              已选择: {fileName}
            </p>
          )}
        </div>
      </div>

      {progress.foundRecords > 0 && !progress.isComplete && (
        <div className="mt-4 p-4 bg-cyan-50 rounded-lg">
          <div className="flex items-center gap-2 text-cyan-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">
              解析中... 已处理 {progress.processedLines} 行，发现 {progress.foundRecords} 条记录
            </span>
          </div>
          <div className="mt-2 h-2 bg-cyan-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${Math.min(100, (progress.processedLines / 100000) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-4">
        <button
          onClick={loadSampleData}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all shadow-md hover:shadow-lg"
        >
          <Play className="w-4 h-4" />
          加载示例数据
        </button>
        
        {error && (
          <div className="flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
