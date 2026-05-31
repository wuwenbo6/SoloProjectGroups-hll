import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Zap, Play, Loader2, Shield, Cpu, Globe, AlertTriangle, Info, FilterX } from 'lucide-react';
import { FileUploader } from '@/components/FileUploader';
import { TerminalInput } from '@/components/TerminalInput';
import { FilterPanel } from '@/components/FilterPanel';
import { ProgressBar } from '@/components/ProgressBar';
import { LogOutput } from '@/components/LogOutput';
import { ResultCard } from '@/components/ResultCard';
import { BatchProcessor } from '@/components/BatchProcessor';
import { useFFmpeg } from '@/hooks/useFFmpeg';
import { VideoFile, OutputFile, FilterConfig, DEFAULT_FILTER_CONFIG, ProcessTask } from '@/types';
import { getOutputFileName, formatFileSize } from '@/utils/ffmpegUtils';

export default function Home() {
  const [inputFile, setInputFile] = useState<VideoFile | null>(null);
  const [outputFile, setOutputFile] = useState<OutputFile | null>(null);
  const [command, setCommand] = useState('-i input.mp4 output.avi');
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(DEFAULT_FILTER_CONFIG);
  const [showFilterInfo, setShowFilterInfo] = useState(false);
  const [tasks, setTasks] = useState<ProcessTask[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const batchProcessingRef = useRef(false);
  
  const {
    isLoaded,
    isLoading,
    loadProgress,
    isProcessing,
    progress,
    logs,
    error,
    warning,
    load,
    processVideo,
    clearLogs,
    SUPPORTED_FILTERS,
    UNSUPPORTED_FILTERS,
    MAX_RECOMMENDED_SIZE,
  } = useFFmpeg();

  useEffect(() => {
    return () => {
      if (outputFile?.url) {
        URL.revokeObjectURL(outputFile.url);
      }
      tasks.forEach(task => {
        if (task.result) {
          try {
            URL.revokeObjectURL(URL.createObjectURL(task.result));
          } catch (e) {}
        }
      });
    };
  }, [outputFile, tasks]);

  const handleFileSelect = useCallback((file: VideoFile | null) => {
    setInputFile(file);
    setOutputFile(null);
    setTasks([]);
    if (file && file.width && file.height) {
      setFilterConfig(prev => ({
        ...prev,
        scale: { ...prev.scale, width: file.width || 1280, height: file.height || 720 },
        crop: { ...prev.crop, width: Math.min(640, file.width || 640), height: Math.min(480, file.height || 480) },
      }));
    }
  }, []);

  const handleProcess = async () => {
    if (!inputFile) {
      alert('请先选择文件');
      return;
    }

    if (!isLoaded) {
      await load();
      if (!isLoaded) return;
    }

    const result = await processVideo(inputFile.file, command, filterConfig);
    
    if (result.blob) {
      const outputFileName = getOutputFileName(command);
      const url = URL.createObjectURL(result.blob);
      
      setOutputFile({
        name: outputFileName,
        url,
        size: result.blob.size,
        blob: result.blob,
      });
    }
  };

  const handleAddBatchTasks = useCallback((commands: string[]) => {
    if (!inputFile) return;
    
    const newTasks: ProcessTask[] = commands.map((cmd, index) => ({
      id: `${getOutputFileName(cmd).replace('output_', '').replace('.', '_')}_${Date.now()}_${index}`,
      fileName: inputFile.name,
      command: cmd,
      status: 'pending' as const,
      progress: 0,
      createdAt: Date.now(),
    }));
    
    setTasks(prev => [...prev, ...newTasks]);
  }, [inputFile]);

  const handleRemoveTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateTaskProgress = useCallback((id: string, progress: number) => {
    setTasks(prev => prev.map(t => 
      t.id === id ? { ...t, progress } : t
    ));
  }, []);

  const handleStartBatch = useCallback(async () => {
    if (!inputFile || batchProcessingRef.current) return;
    
    if (!isLoaded) {
      await load();
      if (!isLoaded) return;
    }

    batchProcessingRef.current = true;
    setIsBatchProcessing(true);
    
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    
    for (const task of pendingTasks) {
      if (!batchProcessingRef.current) break;
      
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, status: 'processing' as const, progress: 0 } : t
      ));

      try {
        const progressInterval = setInterval(() => {
          updateTaskProgress(task.id, Math.min(task.progress + 5, 95));
        }, 500);

        const result = await processVideo(inputFile.file, task.command);
        
        clearInterval(progressInterval);

        if (result.blob) {
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { 
              ...t, 
              status: 'completed' as const, 
              progress: 100, 
              result: result.blob,
              completedAt: Date.now() 
            } : t
          ));
        } else {
          setTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, status: 'error' as const, progress: 0, error: '处理失败' } : t
          ));
        }
      } catch (err) {
        setTasks(prev => prev.map(t => 
          t.id === task.id ? { ...t, status: 'error' as const, progress: 0, error: String(err) } : t
        ));
      }
    }

    batchProcessingRef.current = false;
    setIsBatchProcessing(false);
  }, [inputFile, isLoaded, load, tasks, processVideo, updateTaskProgress]);

  const handleCancelBatch = useCallback(() => {
    batchProcessingRef.current = false;
    setIsBatchProcessing(false);
  }, []);

  const handleDownloadTaskResult = useCallback((task: ProcessTask) => {
    if (!task.result) return;
    
    const url = URL.createObjectURL(task.result);
    const a = document.createElement('a');
    a.href = url;
    a.download = getOutputFileName(task.command);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleExportScript = useCallback(() => {
    if (tasks.length === 0) return;

    const scriptContent = `#!/bin/bash
# FFmpeg 批量处理脚本
# 生成时间: ${new Date().toLocaleString()}
# 输入文件: ${inputFile?.name || 'input.mp4'}

set -e

echo "开始批量处理..."

${tasks.filter(t => t.status !== 'error').map((task, i) => `
# 任务 ${i + 1}: ${task.id.split('_')[0]}
echo "执行: ffmpeg ${task.command}"
ffmpeg ${task.command}
`).join('\n')}

echo ""
echo "批量处理完成！"
`;

    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ffmpeg_batch.sh';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [tasks, inputFile]);

  const handleDownload = () => {
    if (!outputFile) return;
    
    const a = document.createElement('a');
    a.href = outputFile.url;
    a.download = outputFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleClearOutput = () => {
    if (outputFile?.url) {
      URL.revokeObjectURL(outputFile.url);
    }
    setOutputFile(null);
  };

  const canProcess = inputFile && !isProcessing && !isBatchProcessing;
  const showFFmpegStatus = isLoading || isLoaded;

  return (
    <div className="min-h-screen pb-12">
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-500/10 to-transparent" />
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="text-center">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary-500/30">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary-400 to-primary-200 bg-clip-text text-transparent">
                FFmpeg Web
              </h1>
            </div>
            <p className="text-lg text-dark-100 max-w-2xl mx-auto">
              浏览器端视频处理工具，基于 FFmpeg.wasm 技术，本地处理保护隐私
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 max-w-3xl mx-auto">
            <div className="glass rounded-xl p-4 flex items-center gap-3">
              <Shield className="w-8 h-8 text-primary-400 flex-shrink-0" />
              <div>
                <h3 className="font-medium">隐私安全</h3>
                <p className="text-sm text-dark-200">所有处理在本地完成</p>
              </div>
            </div>
            <div className="glass rounded-xl p-4 flex items-center gap-3">
              <Cpu className="w-8 h-8 text-primary-400 flex-shrink-0" />
              <div>
                <h3 className="font-medium">多线程加速</h3>
                <p className="text-sm text-dark-200">WebAssembly 多线程核心</p>
              </div>
            </div>
            <div className="glass rounded-xl p-4 flex items-center gap-3">
              <Globe className="w-8 h-8 text-primary-400 flex-shrink-0" />
              <div>
                <h3 className="font-medium">批量处理</h3>
                <p className="text-sm text-dark-200">支持任务队列和脚本导出</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {warning && (
              <div className="glass rounded-xl p-4 border border-warning/50 bg-warning/10 animate-fade-in">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-warning">⚠️ 警告</h3>
                    <p className="text-sm text-dark-100 mt-1">{warning}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="glass rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">1. 选择文件</h2>
                <span className="text-xs text-dark-300">
                  建议 {"<"} {formatFileSize(MAX_RECOMMENDED_SIZE)}
                </span>
              </div>
              <FileUploader
                onFileSelect={handleFileSelect}
                selectedFile={inputFile}
                disabled={isProcessing || isBatchProcessing}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('single')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'single'
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-700 hover:bg-dark-600'
                }`}
              >
                单任务处理
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('batch')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'batch'
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-700 hover:bg-dark-600'
                }`}
              >
                批量处理
              </button>
            </div>

            {activeTab === 'single' ? (
              <>
                <div className="glass rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4">2. 配置命令</h2>
                  <TerminalInput
                    value={command}
                    onChange={setCommand}
                    disabled={isProcessing || isBatchProcessing}
                  />
                </div>

                {showFFmpegStatus && (
                  <div className="glass rounded-xl p-6">
                    <h2 className="text-lg font-semibold mb-4">
                      {isLoading ? '加载 FFmpeg...' : '处理进度'}
                    </h2>
                    <ProgressBar
                      progress={isLoading ? loadProgress : progress}
                      isProcessing={isProcessing}
                      isLoading={isLoading}
                      error={error}
                      label={isLoading ? '下载 FFmpeg 核心' : '处理中'}
                    />
                  </div>
                )}

                {logs.length > 0 && (
                  <div className="glass rounded-xl p-6">
                    <LogOutput logs={logs} onClear={clearLogs} />
                  </div>
                )}

                {outputFile && (
                  <ResultCard
                    outputFile={outputFile}
                    onDownload={handleDownload}
                    onClear={handleClearOutput}
                  />
                )}
              </>
            ) : (
              <BatchProcessor
                tasks={tasks}
                onAddTask={handleAddBatchTasks}
                onRemoveTask={handleRemoveTask}
                onStartBatch={handleStartBatch}
                onCancelBatch={handleCancelBatch}
                onDownloadResult={handleDownloadTaskResult}
                onExportScript={handleExportScript}
                isProcessing={isBatchProcessing}
                inputFile={inputFile?.file || null}
              />
            )}
          </div>

          <div className="space-y-6">
            {activeTab === 'single' && (
              <div className="glass rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">开始处理</h2>
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={!canProcess}
                  className={`
                    w-full flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-medium text-lg
                    transition-all duration-300
                    ${canProcess
                      ? 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 text-white btn-glow cursor-pointer'
                      : 'bg-dark-700 text-dark-300 cursor-not-allowed'
                    }
                  `}
                >
                  {isProcessing || isLoading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      {isLoading ? '加载中...' : '处理中...'}
                    </>
                  ) : (
                    <>
                      <Play className="w-6 h-6" />
                      {isLoaded ? '开始处理' : '加载并处理'}
                    </>
                  )}
                </button>
                
                {!inputFile && (
                  <p className="text-sm text-dark-200 mt-3 text-center">
                    请先上传视频文件
                  </p>
                )}
              </div>
            )}

            <FilterPanel
              config={filterConfig}
              onChange={setFilterConfig}
              disabled={isProcessing || isBatchProcessing}
              inputWidth={inputFile?.width}
              inputHeight={inputFile?.height}
            />

            <div className="glass rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">滤镜支持</h3>
                <button
                  type="button"
                  onClick={() => setShowFilterInfo(!showFilterInfo)}
                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                >
                  <Info className="w-3 h-3" />
                  {showFilterInfo ? '收起' : '详情'}
                </button>
              </div>
              
              {showFilterInfo ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-success mb-1">✓ 支持的滤镜:</p>
                    <div className="flex flex-wrap gap-1">
                      {SUPPORTED_FILTERS.map((f) => (
                        <span
                          key={f}
                          className="px-2 py-0.5 text-xs bg-success/20 text-success rounded"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-error mb-1">✗ 不支持的滤镜:</p>
                    <div className="flex flex-wrap gap-1">
                      {UNSUPPORTED_FILTERS.map((f) => (
                        <span
                          key={f}
                          className="px-2 py-0.5 text-xs bg-error/20 text-error rounded"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-dark-200">
                  支持 scale、crop、rotate、blur 等 {SUPPORTED_FILTERS.length} 种常用滤镜
                </p>
              )}
            </div>

            <div className="glass rounded-xl p-6">
              <h3 className="font-medium mb-3">使用提示</h3>
              <ul className="text-sm text-dark-200 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary-400">•</span>
                  首次使用会自动下载 FFmpeg 核心 (~25MB)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-400">•</span>
                  大文件建议先压缩，避免内存不足
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-400">•</span>
                  批量处理支持导出 Shell 脚本
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-400">•</span>
                  支持 Tab 键查看命令模板
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-400">•</span>
                  使用 Chrome/Edge 浏览器效果最佳
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-16 text-center text-sm text-dark-300">
        <p>基于 FFmpeg.wasm 构建 | 所有处理在浏览器本地完成</p>
      </footer>
    </div>
  );
}
