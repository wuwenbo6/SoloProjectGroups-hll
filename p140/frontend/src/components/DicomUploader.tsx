import { useCallback, useState } from 'react';
import { Upload, Database, X, AlertCircle, Loader2 } from 'lucide-react';
import { useVolumeStore } from '../store/useVolumeStore';
import { uploadDicomFiles, generateSampleData, getVolumeData } from '../services/api';

interface DicomUploaderProps {
  onClose?: () => void;
}

export default function DicomUploader({ onClose }: DicomUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const {
    sessionId,
    setSessionId,
    setVolumeData,
    setVolumeLoading,
    upload,
    setUploading,
    setUploadProgress,
    setUploadError,
  } = useVolumeStore();

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((file) =>
        file.name.toLowerCase().endsWith('.dcm') || file.name.indexOf('.') === -1
      );

      if (fileArray.length === 0) {
        setUploadError('未找到有效的 DICOM 文件');
        return;
      }

      setUploading(true);
      setUploadError(null);
      setUploadProgress(0);

      try {
        const { sessionId: newSessionId, meta } = await uploadDicomFiles(fileArray);
        setSessionId(newSessionId);

        setUploadProgress(50);

        setVolumeLoading(true);
        const { data, meta: volumeMeta } = await getVolumeData(newSessionId);

        const combinedMeta = { ...meta, ...volumeMeta };
        setVolumeData(data, combinedMeta);

        setUploadProgress(100);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : '上传失败');
      } finally {
        setUploading(false);
      }
    },
    [setSessionId, setVolumeData, setVolumeLoading, setUploading, setUploadProgress, setUploadError]
  );

  const handleSampleData = useCallback(async () => {
    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      const { sessionId: newSessionId, meta } = await generateSampleData();
      setSessionId(newSessionId);

      setUploadProgress(50);

      setVolumeLoading(true);
      const { data, meta: volumeMeta } = await getVolumeData(newSessionId);

      const combinedMeta = { ...meta, ...volumeMeta };
      setVolumeData(data, combinedMeta);

      setUploadProgress(100);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '生成示例数据失败');
    } finally {
      setUploading(false);
    }
  }, [setSessionId, setVolumeData, setVolumeLoading, setUploading, setUploadProgress, setUploadError]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles]
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">上传 DICOM 序列</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-700 rounded transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          )}
        </div>

        <div className="p-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-400 bg-blue-500/10'
                : 'border-slate-600 hover:border-slate-500'
            }`}
          >
            {upload.uploading ? (
              <div className="space-y-3">
                <Loader2 className="w-12 h-12 text-blue-400 mx-auto animate-spin" />
                <div className="text-slate-300 text-sm">处理中...</div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-300 mb-2">拖拽 DICOM 文件到此处</p>
                <p className="text-slate-500 text-sm mb-4">或者</p>
                <label className="inline-block">
                  <input
                    type="file"
                    multiple
                    accept=".dcm,application/dicom"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                  <span className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer transition-colors text-sm">
                    选择文件
                  </span>
                </label>
              </>
            )}
          </div>

          {upload.error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-red-400 text-sm">{upload.error}</span>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-slate-400 text-sm mb-3">没有 DICOM 文件？</p>
            <button
              onClick={handleSampleData}
              disabled={upload.uploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-lg transition-colors"
            >
              <Database className="w-4 h-4" />
              <span>使用示例数据</span>
            </button>
          </div>

          <p className="mt-4 text-slate-500 text-xs text-center">
            支持上传单个或多个 .dcm 文件，最大 500MB
          </p>
        </div>
      </div>
    </div>
  );
}
