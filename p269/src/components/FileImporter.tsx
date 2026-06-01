import React, { useCallback, useState } from 'react';
import { Upload, FileAudio, X } from 'lucide-react';
import { useDmrStore } from '@/store/useDmrStore';
import { formatDuration, formatBytes } from '@/utils/format';
import type { WavFileInfo } from '@/types';

interface FileImporterProps {
  onSelect: () => void;
}

export const FileImporter: React.FC<FileImporterProps> = ({ onSelect }) => {
  const { fileInfo, reset, isAnalyzing } = useDmrStore();
  const [isDragging, setIsDragging] = useState(false);

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
    if (files.length > 0 && files[0].name.endsWith('.wav')) {
      onSelect();
    }
  }, [onSelect]);

  const handleClick = useCallback(() => {
    if (!isAnalyzing) {
      onSelect();
    }
  }, [onSelect, isAnalyzing]);

  const handleReset = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAnalyzing) {
      reset();
    }
  }, [reset, isAnalyzing]);

  if (fileInfo) {
    return <FileInfoCard fileInfo={fileInfo} onReset={handleReset} disabled={isAnalyzing} />;
  }

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
        isDragging
          ? 'border-cyan-400 bg-cyan-400/10'
          : 'border-gray-600 hover:border-cyan-500/50 hover:bg-gray-800/50'
      } ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <div className="flex flex-col items-center gap-4">
        <div className={`p-4 rounded-full transition-all duration-300 ${
          isDragging ? 'bg-cyan-400/20' : 'bg-gray-700/50'
        }`}>
          <Upload className={`w-12 h-12 transition-colors ${
            isDragging ? 'text-cyan-400' : 'text-gray-400'
          }`} />
        </div>
        <div>
          <p className="text-lg font-medium text-gray-200">
            拖拽 WAV 文件到此处
          </p>
          <p className="text-sm text-gray-500 mt-1">
            或点击选择文件
          </p>
        </div>
        <p className="text-xs text-gray-600">
          支持 48kHz / 44.1kHz / 22.05kHz 采样率
        </p>
      </div>

      {isDragging && (
        <div className="absolute inset-0 bg-cyan-400/5 rounded-xl pointer-events-none animate-pulse" />
      )}
    </div>
  );
};

interface FileInfoCardProps {
  fileInfo: WavFileInfo;
  onReset: (e: React.MouseEvent) => void;
  disabled: boolean;
}

const FileInfoCard: React.FC<FileInfoCardProps> = ({ fileInfo, onReset, disabled }) => {
  return (
    <div className="relative bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-gray-700">
      <button
        className={`absolute top-3 right-3 p-1.5 rounded-lg transition-colors ${
          disabled
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'
        }`}
        onClick={onReset}
        disabled={disabled}
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className="p-3 bg-cyan-500/10 rounded-lg">
          <FileAudio className="w-8 h-8 text-cyan-400" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-100 truncate" title={fileInfo.name}>
            {fileInfo.name}
          </h3>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3">
            <InfoRow label="采样率" value={`${fileInfo.sampleRate.toLocaleString()} Hz`} />
            <InfoRow label="声道" value={fileInfo.channels === 1 ? '单声道' : `${fileInfo.channels} 声道`} />
            <InfoRow label="位深" value={`${fileInfo.bitsPerSample} bit`} />
            <InfoRow label="时长" value={formatDuration(fileInfo.duration * 1000)} />
            <InfoRow label="大小" value={formatBytes(fileInfo.size)} />
          </div>
        </div>
      </div>

      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none" />
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-gray-500">{label}:</span>
    <span className="text-xs font-mono text-gray-300">{value}</span>
  </div>
);
