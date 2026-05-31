import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileVideo, X, Play, Info } from 'lucide-react';
import { VideoFile } from '@/types';
import { formatFileSize } from '@/utils/ffmpegUtils';

interface FileUploaderProps {
  onFileSelect: (file: VideoFile) => void;
  selectedFile: VideoFile | null;
  disabled?: boolean;
}

export function FileUploader({ onFileSelect, selectedFile, disabled }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [videoInfo, setVideoInfo] = useState<{ width?: number; height?: number; duration?: number }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [disabled]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, []);

  const processFile = async (file: File) => {
    if (!file.type.startsWith('video/') && !file.type.startsWith('audio/') && !file.type.startsWith('image/')) {
      alert('请上传视频、音频或图片文件');
      return;
    }

    const url = URL.createObjectURL(file);
    const videoFile: VideoFile = {
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      url,
    };

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        videoFile.width = video.videoWidth;
        videoFile.height = video.videoHeight;
        videoFile.duration = video.duration;
        setVideoInfo({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
        });
        URL.revokeObjectURL(video.src);
      };
      video.src = url;
    }

    onFileSelect(videoFile);
  };

  const handleRemove = useCallback(() => {
    if (selectedFile?.url) {
      URL.revokeObjectURL(selectedFile.url);
    }
    setVideoInfo({});
    onFileSelect(null as any);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [selectedFile, onFileSelect]);

  const handleClick = () => {
    if (!disabled && !selectedFile) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,image/*"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
      
      {!selectedFile ? (
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            file-drop-zone relative border-2 border-dashed rounded-xl p-8 md:p-12
            flex flex-col items-center justify-center cursor-pointer
            transition-all duration-300 min-h-[200px]
            ${isDragging ? 'dragover' : 'border-dark-300 hover:border-primary-500'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent rounded-xl opacity-0 hover:opacity-100 transition-opacity" />
          <Upload className={`w-12 h-12 mb-4 transition-colors ${isDragging ? 'text-primary-400' : 'text-primary-500'}`} />
          <p className="text-lg font-medium mb-2">拖拽文件到此处或点击上传</p>
          <p className="text-sm text-dark-200">支持 MP4, WebM, AVI, MOV, MP3, WAV, GIF 等格式</p>
        </div>
      ) : (
        <div className="glass rounded-xl p-4 animate-fade-in">
          <div className="flex items-start gap-4">
            <div className="relative w-32 h-20 bg-dark-700 rounded-lg overflow-hidden flex-shrink-0">
              {selectedFile.type.startsWith('video/') ? (
                <video
                  ref={videoRef}
                  src={selectedFile.url}
                  className="w-full h-full object-cover"
                  muted
                />
              ) : selectedFile.type.startsWith('image/') ? (
                <img src={selectedFile.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FileVideo className="w-8 h-8 text-primary-400" />
                </div>
              )}
              {selectedFile.type.startsWith('video/') && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="w-8 h-8 text-white fill-current" />
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{selectedFile.name}</h3>
                  <p className="text-sm text-dark-200">{formatFileSize(selectedFile.size)}</p>
                </div>
                {!disabled && (
                  <button
                    onClick={handleRemove}
                    className="p-1 rounded-lg hover:bg-dark-600 transition-colors flex-shrink-0"
                  >
                    <X className="w-5 h-5 text-dark-200 hover:text-white" />
                  </button>
                )}
              </div>
              
              {videoInfo.width && videoInfo.height && (
                <div className="mt-2 flex items-center gap-4 text-sm text-dark-200">
                  <span className="flex items-center gap-1">
                    <Info className="w-4 h-4" />
                    {videoInfo.width} × {videoInfo.height}
                  </span>
                  {videoInfo.duration && (
                    <span>
                      {Math.floor(videoInfo.duration / 60)}:{Math.floor(videoInfo.duration % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
