import React, { useCallback, useState } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { useFitStore } from '../store/useFitStore';

const FileUpload: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const { 
    measuredData, 
    fileName, 
    isLoading,
    modelType,
    setFileName, 
    setLoading, 
    setError,
    reset 
  } = useFitStore();

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setError('请上传CSV或TXT格式的文件');
      return;
    }

    setLoading(true);
    setError(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('modelType', modelType);

    try {
      const response = await fetch('/api/fit', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '拟合失败');
      }

      const { measuredData, fittedData, parameters, statistics, spiceStatement } = result.data;
      useFitStore.getState().setMeasuredData(measuredData);
      useFitStore.getState().setFittedData(fittedData);
      useFitStore.getState().setParameters(parameters);
      useFitStore.getState().setStatistics(statistics);
      useFitStore.getState().setSpiceStatement(spiceStatement);
    } catch (err: any) {
      setError(err.message || '上传失败');
    } finally {
      setLoading(false);
    }
  }, [modelType, setFileName, setLoading, setError]);

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
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div className="w-full">
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 ${
          isDragging 
            ? 'border-emerald-500 bg-emerald-50' 
            : 'border-slate-300 hover:border-slate-400 bg-white'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".csv,.txt"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isLoading}
        />
        <div className="flex flex-col items-center justify-center space-y-4">
          {isLoading ? (
            <>
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
              <p className="text-slate-600 font-medium">正在处理数据...</p>
            </>
          ) : fileName && measuredData.length > 0 ? (
            <>
              <div className="flex items-center space-x-3">
                <FileText className="w-10 h-10 text-emerald-500" />
                <div>
                  <p className="text-slate-800 font-medium">{fileName}</p>
                  <p className="text-slate-500 text-sm">{measuredData.length} 个数据点</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleReset();
                }}
                className="flex items-center space-x-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
                <span>移除文件</span>
              </button>
            </>
          ) : (
            <>
              <Upload className={`w-12 h-12 ${isDragging ? 'text-emerald-500' : 'text-slate-400'}`} />
              <div className="text-center">
                <p className="text-slate-700 font-medium">
                  拖拽文件到此处，或点击选择
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  支持 CSV、TXT 格式
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
