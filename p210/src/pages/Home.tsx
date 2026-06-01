import { useState, useRef, useCallback } from 'react';
import { Upload, FileUp, X, Zap, Activity, RotateCcw, Eye, Download } from 'lucide-react';
import { useUploadStore } from '@/stores/uploadStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';
import { BlockGrid } from '@/components/BlockGrid';
import { TransferLog } from '@/components/TransferLog';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUpload = useUploadStore((s) => s.currentUpload);
  const isUploading = useUploadStore((s) => s.isUploading);
  const setIsUploading = useUploadStore((s) => s.setIsUploading);
  const setCurrentUpload = useUploadStore((s) => s.setCurrentUpload);
  const setPendingFile = useUploadStore((s) => s.setPendingFile);
  const wsConnected = useUploadStore((s) => s.wsConnected);
  const observerCount = useUploadStore((s) => s.observerCount);
  const completedFiles = useUploadStore((s) => s.completedFiles);
  const coapNotifications = useUploadStore((s) => s.coapNotifications);

  useWebSocket();

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
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setPendingFile(droppedFile);
    }
  }, [setPendingFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPendingFile(selected);
    }
  }, [setPendingFile]);

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setIsUploading(true);
    setCurrentUpload({
      id: '',
      fileName: file.name,
      fileSize: file.size,
      status: 'pending',
      currentBlock: 0,
      totalBlocks: Math.ceil(file.size / 1024),
      bytesSent: 0,
      totalBytes: file.size,
      blockSize: 1024,
      speed: 0,
      logs: [],
      createdAt: Date.now(),
      lastSuccessfulBlock: -1,
    });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        const cur = useUploadStore.getState().currentUpload;
        setCurrentUpload(cur ? { ...cur, id: data.data.id } : null);
      } else {
        const cur = useUploadStore.getState().currentUpload;
        setCurrentUpload(cur ? { ...cur, status: 'failed' } : null);
        setIsUploading(false);
      }
    } catch {
      const cur = useUploadStore.getState().currentUpload;
      setCurrentUpload(cur ? { ...cur, status: 'failed' } : null);
      setIsUploading(false);
    }
  }, [file, setIsUploading, setCurrentUpload]);

  const handleResume = useCallback(async () => {
    if (!currentUpload || currentUpload.status !== 'failed') return;

    const resumeFrom = currentUpload.lastSuccessfulBlock + 1;

    if (resumeFrom >= currentUpload.totalBlocks) {
      return;
    }

    setIsUploading(true);
    const params = new URLSearchParams({
      id: currentUpload.id,
      resume_from: String(resumeFrom),
    });

    try {
      const res = await fetch(`/api/upload?${params.toString()}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        console.log('[Resume] Continue from block', resumeFrom);
      } else {
        const cur = useUploadStore.getState().currentUpload;
        setCurrentUpload(cur ? { ...cur, status: 'failed' } : null);
        setIsUploading(false);
      }
    } catch {
      const cur = useUploadStore.getState().currentUpload;
      setCurrentUpload(cur ? { ...cur, status: 'failed' } : null);
      setIsUploading(false);
    }
  }, [currentUpload, setIsUploading, setCurrentUpload]);

  const handleReset = useCallback(() => {
    setFile(null);
    setCurrentUpload(null);
    setIsUploading(false);
    setPendingFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [setCurrentUpload, setIsUploading, setPendingFile]);

  const progress = currentUpload
    ? currentUpload.totalBytes > 0
      ? (currentUpload.bytesSent / currentUpload.totalBytes) * 100
      : 0
    : 0;

  const elapsed = currentUpload
    ? currentUpload.completedAt
      ? currentUpload.completedAt - currentUpload.createdAt
      : Date.now() - currentUpload.createdAt
    : 0;

  const eta =
    currentUpload && currentUpload.speed > 0
      ? ((currentUpload.totalBytes - currentUpload.bytesSent) / currentUpload.speed) * 1000
      : 0;

  const isActive = currentUpload?.status === 'uploading';
  const isCompleted = currentUpload?.status === 'completed';
  const isFailed = currentUpload?.status === 'failed';

  const resumeFromBlock = currentUpload && isFailed ? currentUpload.lastSuccessfulBlock + 1 : 0;
  const canResume = isFailed && currentUpload && resumeFromBlock < currentUpload.totalBlocks && currentUpload.id;

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      <div className="max-w-[960px] mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
              CoAP Block1 Upload
            </h1>
          </div>
          <p className="text-sm text-zinc-400 ml-[52px]">
            基于 RFC 7959 Block1/Block2 选项的文件分块上传演示 · 支持 Observe 观察者模式
            <span className={cn(
              'ml-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs',
              wsConnected ? 'bg-teal-500/10 text-teal-400' : 'bg-red-500/10 text-red-400'
            )}>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                wsConnected ? 'bg-teal-400 animate-pulse' : 'bg-red-400'
              )} />
              {wsConnected ? 'WebSocket 已连接' : 'WebSocket 断开'}
            </span>
            <span className="ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-violet-500/10 text-violet-400">
              <Eye className="w-3 h-3" />
              {observerCount} 观察者
            </span>
          </p>
        </header>

        {completedFiles.length > 0 && (
          <div className="mb-6 bg-zinc-900/80 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Download className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-medium text-zinc-200">已完成文件 (Block2 下载)</span>
            </div>
            <div className="space-y-2">
              {completedFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-zinc-300">{f.fileName}</p>
                    <p className="text-[10px] text-zinc-500">{formatSize(f.size)}</p>
                  </div>
                  <a
                    href={`/api/coap/download/${f.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`}
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Block2
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {coapNotifications.length > 0 && (
          <div className="mb-6 bg-zinc-900/80 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-zinc-200">观察者通知</span>
              <span className="text-[10px] text-zinc-500">({coapNotifications.length})</span>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {coapNotifications.slice(-8).map((n, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] text-zinc-400">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded font-mono',
                    n.type === 'upload_complete' ? 'bg-teal-500/10 text-teal-400' :
                    n.type === 'upload_failed' ? 'bg-red-500/10 text-red-400' :
                    'bg-amber-500/10 text-amber-400'
                  )}>
                    {n.type === 'coap_block_received' ? '进度' : n.type === 'upload_complete' ? '完成' : '失败'}
                  </span>
                  <span>块 {n.blockNum}</span>
                  <span className="text-zinc-600">{new Date(n.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!currentUpload || isCompleted || isFailed) && !canResume && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={cn(
              'relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300',
              isDragging
                ? 'border-teal-400 bg-teal-500/5 scale-[1.01]'
                : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-900/80',
              isUploading && 'pointer-events-none opacity-50'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="flex flex-col items-center gap-4">
              <div className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center transition-colors',
                isDragging ? 'bg-teal-500/20' : 'bg-zinc-800'
              )}>
                <FileUp className={cn(
                  'w-8 h-8 transition-colors',
                  isDragging ? 'text-teal-400' : 'text-zinc-400'
                )} />
              </div>
              <div>
                <p className="text-lg font-medium text-zinc-200">
                  {isDragging ? '释放文件以上传' : '拖拽文件到这里，或点击选择'}
                </p>
                <p className="text-sm text-zinc-500 mt-1">
                  支持任意文件类型，将通过 CoAP Block1 分块传输
                </p>
              </div>
            </div>
          </div>
        )}

        {canResume && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-amber-200 text-sm">检测到中断的上传</p>
                <p className="text-xs text-amber-400/80 mt-0.5">
                  文件 <span className="font-mono">{currentUpload?.fileName}</span> 已成功传输 {currentUpload?.lastSuccessfulBlock + 1}/{currentUpload?.totalBlocks} 块，
                  可从块 {resumeFromBlock} 继续（携带 Block1 NUM={resumeFromBlock}）
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleResume}
                disabled={isUploading}
                className={cn(
                  'flex-1 py-2.5 rounded-xl font-medium text-sm transition-all',
                  'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white',
                  'shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 active:scale-[0.98]',
                  isUploading && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span className="flex items-center justify-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  续传（从块 {resumeFromBlock}）
                </span>
              </button>
              <button
                onClick={handleReset}
                className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition-colors"
              >
                重新开始
              </button>
            </div>
          </div>
        )}

        {file && (!currentUpload || isCompleted || isFailed) && !canResume && (
          <div className="mt-4 bg-zinc-900/80 rounded-xl border border-zinc-800 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <p className="font-medium text-zinc-200 text-sm">{file.name}</p>
                  <p className="text-xs text-zinc-500">
                    {formatSize(file.size)} · {Math.ceil(file.size / 1024)} 块 · 块大小 1024 B
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isFailed && (
                  <span className="text-xs text-red-400 px-2 py-1 bg-red-500/10 rounded-lg">
                    上传失败
                  </span>
                )}
                {isCompleted && (
                  <span className="text-xs text-teal-400 px-2 py-1 bg-teal-500/10 rounded-lg">
                    上传完成
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReset();
                  }}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {!isUploading && (
              <button
                onClick={handleUpload}
                className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-medium text-sm transition-all shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 active:scale-[0.98]"
              >
                开始 CoAP 分块上传
              </button>
            )}
          </div>
        )}

        {currentUpload && isActive && (
          <div className="mt-6 space-y-4">
            <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-400 animate-pulse" />
                  <span className="text-sm font-medium text-zinc-200">
                    {currentUpload.fileName}
                  </span>
                </div>
                <span className="text-xs text-zinc-500">
                  {progress.toFixed(1)}%
                </span>
              </div>

              <div className="h-3 bg-zinc-800 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-600 via-teal-500 to-amber-400 transition-all duration-300 ease-out relative"
                  style={{ width: `${Math.max(progress, 1)}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="当前块" value={`${currentUpload.currentBlock + 1} / ${currentUpload.totalBlocks}`} />
                <StatCard label="已传输" value={`${formatSize(currentUpload.bytesSent)} / ${formatSize(currentUpload.totalBytes)}`} />
                <StatCard label="速度" value={formatSpeed(currentUpload.speed)} />
                <StatCard label="预计剩余" value={eta > 0 ? formatTime(eta) : '计算中...'} />
              </div>

              <div className="mb-3 text-xs text-zinc-500">
                已确认块: <span className="text-teal-400 font-mono">{currentUpload.lastSuccessfulBlock + 1}</span> / {currentUpload.totalBlocks}
                {' · '}
                最新确认: <span className="text-amber-400 font-mono">M=0, NUM={Math.max(0, currentUpload.lastSuccessfulBlock)}</span>
              </div>

              <BlockGrid
                currentBlock={currentUpload.currentBlock}
                totalBlocks={currentUpload.totalBlocks}
                blockSize={currentUpload.blockSize}
                lastAckedBlock={currentUpload.lastSuccessfulBlock}
              />
            </div>

            <TransferLog logs={currentUpload.logs} />
          </div>
        )}

        {currentUpload && (isCompleted || isFailed) && currentUpload.logs.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-zinc-200">
                  {currentUpload.fileName}
                </span>
                <span className={cn(
                  'text-xs px-2 py-1 rounded-lg',
                  isCompleted ? 'text-teal-400 bg-teal-500/10' : 'text-red-400 bg-red-500/10'
                )}>
                  {isCompleted ? '传输完成' : '传输失败'}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="总块数" value={`${currentUpload.totalBlocks}`} />
                <StatCard label="文件大小" value={formatSize(currentUpload.totalBytes)} />
                <StatCard label="块大小" value={`${currentUpload.blockSize} B`} />
                <StatCard label="耗时" value={formatTime(elapsed)} />
              </div>

              {isFailed && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-xs text-red-400">
                    已成功 {currentUpload.lastSuccessfulBlock + 1} / {currentUpload.totalBlocks} 块，
                    可从块 {resumeFromBlock} 续传（Block1 NUM={resumeFromBlock}）
                  </p>
                </div>
              )}

              <BlockGrid
                currentBlock={currentUpload.currentBlock}
                totalBlocks={currentUpload.totalBlocks}
                blockSize={currentUpload.blockSize}
                completed={isCompleted}
                failed={isFailed}
                lastAckedBlock={currentUpload.lastSuccessfulBlock}
              />
            </div>

            <TransferLog logs={currentUpload.logs} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800/80 rounded-lg px-3 py-2">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-medium text-zinc-200" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        {value}
      </p>
    </div>
  );
}
