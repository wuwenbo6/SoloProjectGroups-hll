import React, { useState, useCallback } from 'react';
import {
  Layers,
  Plus,
  Play,
  Pause,
  Trash2,
  Download,
  FileCode,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Settings2,
} from 'lucide-react';
import { ProcessTask } from '@/types';
import { formatFileSize } from '@/utils/ffmpegUtils';

interface BatchProcessorProps {
  tasks: ProcessTask[];
  onAddTask: (commands: string[]) => void;
  onRemoveTask: (id: string) => void;
  onStartBatch: () => void;
  onCancelBatch: () => void;
  onDownloadResult: (task: ProcessTask) => void;
  onExportScript: () => void;
  isProcessing: boolean;
  inputFile: File | null;
}

const BATCH_PRESETS = [
  {
    name: '多种格式导出',
    description: '同时导出为 MP4、WebM、GIF',
    commands: [
      '-i input.mp4 output_batch.mp4',
      '-i input.mp4 -c:v libvpx-vp9 -crf 30 output_batch.webm',
      '-i input.mp4 -vf "fps=10,scale=320:-1" output_batch.gif',
    ],
  },
  {
    name: '多分辨率压缩',
    description: '1080p、720p、480p 三种分辨率',
    commands: [
      '-i input.mp4 -vf scale=-2:1080 -c:v libx264 -crf 28 output_1080p.mp4',
      '-i input.mp4 -vf scale=-2:720 -c:v libx264 -crf 28 output_720p.mp4',
      '-i input.mp4 -vf scale=-2:480 -c:v libx264 -crf 28 output_480p.mp4',
    ],
  },
  {
    name: '多质量GIF',
    description: '高质量、标准、小尺寸 GIF',
    commands: [
      '-i input.mp4 -vf "fps=15,scale=640:-1" output_large.gif',
      '-i input.mp4 -vf "fps=10,scale=320:-1" output_standard.gif',
      '-i input.mp4 -vf "fps=8,scale=240:-1" output_small.gif',
    ],
  },
  {
    name: '全量提取',
    description: '提取音频、封面、多帧',
    commands: [
      '-i input.mp4 -vn -acodec libmp3lame output_audio.mp3',
      '-i input.mp4 -vframes 1 output_cover.jpg',
      '-i input.mp4 -vf "select=eq(n\,50)" -vframes 1 output_frame.jpg',
    ],
  },
];

export function BatchProcessor({
  tasks,
  onAddTask,
  onRemoveTask,
  onStartBatch,
  onCancelBatch,
  onDownloadResult,
  onExportScript,
  isProcessing,
  inputFile,
}: BatchProcessorProps) {
  const [showPresets, setShowPresets] = useState(false);

  const getStatusIcon = (status: ProcessTask['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-dark-300" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-error" />;
    }
  };

  const getStatusText = (status: ProcessTask['status']) => {
    switch (status) {
      case 'pending':
        return '等待中';
      case 'processing':
        return '处理中';
      case 'completed':
        return '已完成';
      case 'error':
        return '失败';
    }
  };

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const processingCount = tasks.filter(t => t.status === 'processing').length;

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary-400" />
          <span className="font-medium">批量处理</span>
          {tasks.length > 0 && (
            <span className="text-xs px-2 py-0.5 bg-primary-500/20 text-primary-400 rounded-full">
              {tasks.length} 个任务
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExportScript}
            disabled={tasks.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileCode className="w-4 h-4" />
            导出脚本
          </button>
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            disabled={!inputFile || isProcessing}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-dark-700 hover:bg-dark-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Settings2 className="w-4 h-4" />
            预设
          </button>
        </div>
      </div>

      {showPresets && (
        <div className="mb-4 p-3 bg-dark-700/50 rounded-lg animate-fade-in">
          <p className="text-xs text-dark-200 mb-2">选择批量处理预设：</p>
          <div className="grid grid-cols-2 gap-2">
            {BATCH_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  onAddTask(preset.commands);
                  setShowPresets(false);
                }}
                disabled={isProcessing}
                className="p-3 text-left rounded-lg bg-dark-600/50 hover:bg-dark-500/50 transition-colors disabled:opacity-50"
              >
                <p className="font-medium text-sm">{preset.name}</p>
                <p className="text-xs text-dark-200 mt-1">{preset.description}</p>
                <p className="text-xs text-primary-400 mt-1">{preset.commands.length} 个任务</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`
                flex items-center justify-between p-3 rounded-lg border transition-all
                ${task.status === 'completed' ? 'bg-success/10 border-success/30' : ''}
                ${task.status === 'error' ? 'bg-error/10 border-error/30' : ''}
                ${task.status === 'processing' ? 'bg-primary-500/10 border-primary-500/30' : ''}
                ${task.status === 'pending' ? 'bg-dark-700/50 border-dark-600' : ''}
              `}
            >
              <div className="flex items-center gap-3 min-w-0">
                {getStatusIcon(task.status)}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate max-w-xs">
                    {task.id.split('_')[0]}
                  </p>
                  <p className="text-xs text-dark-300 font-mono truncate max-w-xs">
                    {task.command.substring(0, 50)}...
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {task.status === 'processing' && (
                  <span className="text-xs text-primary-400">{task.progress}%</span>
                )}
                {task.status === 'completed' && task.result && (
                  <span className="text-xs text-success">
                    {formatFileSize(task.result.size)}
                  </span>
                )}
                {task.status === 'completed' && task.result && (
                  <button
                    type="button"
                    onClick={() => onDownloadResult(task)}
                    className="p-1.5 hover:bg-success/20 rounded transition-colors"
                  >
                    <Download className="w-4 h-4 text-success" />
                  </button>
                )}
                {task.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => onRemoveTask(task.id)}
                    disabled={isProcessing}
                    className="p-1.5 hover:bg-error/20 rounded transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4 text-error" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tasks.length > 0 && (
        <div className="flex items-center justify-between pt-3 border-t border-dark-700">
          <div className="flex items-center gap-3 text-xs text-dark-200">
            <span>等待: {pendingCount}</span>
            <span>处理中: {processingCount}</span>
            <span>完成: {completedCount}</span>
          </div>

          <div className="flex items-center gap-2">
            {isProcessing ? (
              <button
                type="button"
                onClick={onCancelBatch}
                className="flex items-center gap-2 px-4 py-2 bg-error hover:bg-error/80 text-white rounded-lg transition-colors"
              >
                <Pause className="w-4 h-4" />
                取消
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartBatch}
                disabled={pendingCount === 0}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-400 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed btn-glow"
              >
                <Play className="w-4 h-4" />
                开始批量处理
              </button>
            )}
          </div>
        </div>
      )}

      {tasks.length === 0 && !showPresets && (
        <div className="text-center py-8">
          <Layers className="w-12 h-12 text-dark-500 mx-auto mb-3" />
          <p className="text-dark-300 text-sm">暂无批量任务</p>
          <p className="text-dark-400 text-xs mt-1">点击"预设"添加批量处理任务</p>
        </div>
      )}
    </div>
  );
}
