import React from 'react';
import { Download, FileVideo, X, Play, Music, Image } from 'lucide-react';
import { OutputFile } from '@/types';
import { formatFileSize } from '@/utils/ffmpegUtils';

interface ResultCardProps {
  outputFile: OutputFile | null;
  onDownload: () => void;
  onClear: () => void;
}

export function ResultCard({ outputFile, onDownload, onClear }: ResultCardProps) {
  if (!outputFile) return null;

  const isVideo = outputFile.name.match(/\.(mp4|webm|avi|mov|mkv)$/i);
  const isAudio = outputFile.name.match(/\.(mp3|wav|flac|ogg|aac)$/i);
  const isImage = outputFile.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);

  return (
    <div className="glass rounded-xl p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isVideo ? (
            <FileVideo className="w-5 h-5 text-success" />
          ) : isAudio ? (
            <Music className="w-5 h-5 text-success" />
          ) : isImage ? (
            <Image className="w-5 h-5 text-success" />
          ) : (
            <FileVideo className="w-5 h-5 text-success" />
          )}
          <span className="font-medium">处理完成</span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="p-1 rounded-lg hover:bg-dark-600 transition-colors"
        >
          <X className="w-5 h-5 text-dark-200 hover:text-white" />
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <div className="relative w-full aspect-video bg-dark-700 rounded-lg overflow-hidden">
            {isVideo ? (
              <video
                src={outputFile.url}
                controls
                className="w-full h-full object-contain"
              />
            ) : isImage ? (
              <img
                src={outputFile.url}
                alt="Output"
                className="w-full h-full object-contain"
              />
            ) : isAudio ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-4">
                <Music className="w-16 h-16 text-primary-400 mb-4" />
                <audio
                  src={outputFile.url}
                  controls
                  className="w-full"
                />
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center">
                <FileVideo className="w-16 h-16 text-primary-400 mb-2" />
                <p className="text-sm text-dark-200">此格式不支持预览</p>
              </div>
            )}
          </div>
        </div>

        <div className="md:w-64 flex flex-col gap-3">
          <div className="p-3 bg-dark-700/50 rounded-lg">
            <p className="text-sm font-medium truncate">{outputFile.name}</p>
            <p className="text-xs text-dark-200 mt-1">{formatFileSize(outputFile.size)}</p>
          </div>

          <button
            type="button"
            onClick={onDownload}
            className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 text-white font-medium rounded-lg btn-glow transition-all"
          >
            <Download className="w-5 h-5" />
            下载文件
          </button>
        </div>
      </div>
    </div>
  );
}
