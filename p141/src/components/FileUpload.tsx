import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { gsdmlParser } from '../services/gsdmlParser';
import { configService } from '../services/configService';

export const FileUpload: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { setParsedGSDML, setDeviceConfig, setModuleTree, setIsLoading, setError, setWarnings, resetState } =
    useAppStore();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.xml') && !file.name.toLowerCase().endsWith('.gsdml')) {
        setError('请上传XML或GSDML格式的文件');
        return;
      }

      setIsLoading(true);
      setError(null);
      setWarnings([]);

      try {
        const text = await file.text();
        const validation = gsdmlParser.validate(text);

        if (validation.warnings.length > 0) {
          setWarnings(validation.warnings);
        }

        if (!validation.valid) {
          setError(validation.errors.join('; '));
          setIsLoading(false);
          return;
        }

        const parsed = await gsdmlParser.parse(text);
        const tree = gsdmlParser.getModuleTree(parsed.device);
        const defaultConfig = configService.createDefaultConfig(parsed.device);

        setParsedGSDML(parsed);
        setModuleTree(tree);
        setDeviceConfig(defaultConfig);
        setUploadedFile(file);
      } catch (err) {
        setError(`解析失败: ${(err as Error).message}`);
      } finally {
        setIsLoading(false);
      }
    },
    [setParsedGSDML, setDeviceConfig, setModuleTree, setIsLoading, setError, setWarnings]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFile(files[0]);
      }
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
    },
    [processFile]
  );

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleClear = () => {
    resetState();
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 cursor-pointer
          ${isDragging ? 'border-[#165DFF] bg-[#165DFF]/5 scale-[1.02]' : 'border-gray-300 hover:border-gray-400'}
          ${uploadedFile ? 'bg-green-50 border-green-300' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.gsdml,application/xml"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          {uploadedFile ? (
            <>
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                <p className="text-xs text-gray-500">{(uploadedFile.size / 1024).toFixed(2)} KB</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                className="absolute top-3 right-3 p-1.5 rounded-full bg-white shadow-md hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Upload className={`w-8 h-8 transition-colors ${isDragging ? 'text-[#165DFF]' : 'text-gray-400'}`} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900">拖拽GSDML文件到此处，或点击选择</p>
                <p className="text-xs text-gray-500 mt-1">支持 .xml 和 .gsdml 格式</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-start space-x-2 text-xs text-gray-500">
        <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>GSDML (General Station Description Markup Language) 是PROFINET设备的标准化描述文件，包含设备的模块、子模块和IO数据定义。</span>
      </div>
    </div>
  );
};
