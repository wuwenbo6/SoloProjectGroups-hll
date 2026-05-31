import { useState, useCallback, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { FilterConfig } from '@/types';
import { parseCommandArgs, getOutputFileName, buildFilterString, injectFilterToCommand, formatFileSize } from '@/utils/ffmpegUtils';

const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/umd';

export const MAX_RECOMMENDED_SIZE = 500 * 1024 * 1024;
export const MAX_ALLOWED_SIZE = 2 * 1024 * 1024 * 1024;

export const SUPPORTED_FILTERS = [
  'scale', 'crop', 'trim', 'rotate', 'pad',
  'fade', 'lutrgb', 'lutyuv', 'hflip', 'vflip',
  'transpose', 'colorbalance', 'eq', 'curves',
  'unsharp', 'gblur', 'boxblur', 'chromakey',
  'colorkey', 'fps', 'setpts', 'atempo', 'volume'
];

export const UNSUPPORTED_FILTERS = [
  'overlay', 'amix', 'amerge', 'concat',
  'map', 'split', 'zmq', 'movie', 'frei0r'
];

export interface ProcessResult {
  blob: Blob | null;
  warning?: string;
}

export function useFFmpeg() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isLoaded || isLoading) return;

    setIsLoading(true);
    setLoadProgress(0);
    setError(null);

    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => {
        setLogs(prev => [...prev.slice(-200), message]);
      });

      ffmpeg.on('progress', ({ progress: p }) => {
        setProgress(Math.round(p * 100));
      });

      setLogs(prev => [...prev, '正在加载 FFmpeg 核心 (支持多线程)...']);
      
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
      });

      setIsLoaded(true);
      setLogs(prev => [...prev, 'FFmpeg 核心加载完成 ✓']);
      setLogs(prev => [...prev, '提示: 完整版核心支持更多滤镜']);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'FFmpeg 加载失败';
      setError(errorMsg);
      setLogs(prev => [...prev, `错误: ${errorMsg}`]);
      setLogs(prev => [...prev, '尝试回退到单线程版本...']);
      
      try {
        await loadSingleThreaded();
      } catch (e) {
        setLogs(prev => [...prev, '回退失败，请刷新页面重试']);
      }
    } finally {
      setIsLoading(false);
      setLoadProgress(100);
    }
  }, [isLoaded, isLoading]);

  const loadSingleThreaded = async () => {
    const singleThreadBaseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    const ffmpeg = new FFmpeg();
    ffmpegRef.current = ffmpeg;

    ffmpeg.on('log', ({ message }) => {
      setLogs(prev => [...prev.slice(-200), message]);
    });

    ffmpeg.on('progress', ({ progress: p }) => {
      setProgress(Math.round(p * 100));
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${singleThreadBaseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${singleThreadBaseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    setIsLoaded(true);
    setLogs(prev => [...prev, 'FFmpeg 单线程核心加载完成 ✓']);
  };

  const checkFileSize = useCallback((size: number): { ok: boolean; warning?: string; error?: string } => {
    if (size > MAX_ALLOWED_SIZE) {
      return {
        ok: false,
        error: `文件过大 (${formatFileSize(size)})。为避免浏览器崩溃，最大支持 ${formatFileSize(MAX_ALLOWED_SIZE)}。`
      };
    }
    if (size > MAX_RECOMMENDED_SIZE) {
      return {
        ok: true,
        warning: `文件较大 (${formatFileSize(size)})。大文件处理可能较慢，建议处理前压缩。`
      };
    }
    return { ok: true };
  }, []);

  const processVideo = useCallback(async (
    file: File,
    command: string,
    filterConfig?: FilterConfig
  ): Promise<ProcessResult> => {
    if (!ffmpegRef.current || !isLoaded) {
      setError('FFmpeg 未加载');
      return { blob: null };
    }

    const sizeCheck = checkFileSize(file.size);
    if (sizeCheck.error) {
      setError(sizeCheck.error);
      return { blob: null };
    }
    if (sizeCheck.warning) {
      setWarning(sizeCheck.warning);
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setLogs(['开始处理...']);

    const inputFileName = 'input' + getFileExtension(file.name);
    const outputFileName = getOutputFileName(command);
    let resultBlob: Blob | null = null;

    try {
      const ffmpeg = ffmpegRef.current;

      setLogs(prev => [...prev, `正在写入文件... (${formatFileSize(file.size)})`]);
      
      const data = await fetchFile(file);
      await ffmpeg.writeFile(inputFileName, data);

      setLogs(prev => [...prev, '文件写入完成']);

      let processedCommand = command;
      if (filterConfig) {
        const filterString = buildFilterString(filterConfig);
        if (filterString) {
          processedCommand = injectFilterToCommand(command, filterString);
          setLogs(prev => [...prev, `应用滤镜: ${filterString}`]);
        }
      }

      const args = parseCommandArgs(processedCommand, inputFileName);
      setLogs(prev => [...prev, `执行: ffmpeg ${args.join(' ')}`]);

      const startTime = Date.now();
      await ffmpeg.exec(args);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      setLogs(prev => [...prev, `处理完成，耗时 ${duration} 秒`]);
      setLogs(prev => [...prev, `读取输出文件: ${outputFileName}`]);
      
      const outputData = await ffmpeg.readFile(outputFileName);
      resultBlob = new Blob([outputData], { type: getMimeType(outputFileName) });

      setLogs(prev => [...prev, `输出文件大小: ${formatFileSize(resultBlob.size)}`]);

      try {
        await ffmpeg.deleteFile(inputFileName);
        await ffmpeg.deleteFile(outputFileName);
        setLogs(prev => [...prev, '已清理临时文件 ✓']);
      } catch (e) {
        setLogs(prev => [...prev, '警告: 清理临时文件失败']);
      }

      setLogs(prev => [...prev, '处理完成 ✓']);
      return { blob: resultBlob, warning: sizeCheck.warning };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '处理失败';
      setError(errorMsg);
      setLogs(prev => [...prev, `错误: ${errorMsg}`]);
      
      if (errorMsg.includes('not compiled') || errorMsg.includes('No such filter')) {
        setLogs(prev => [...prev, '提示: 该滤镜可能在当前 FFmpeg 版本中不支持']);
        setLogs(prev => [...prev, `支持的滤镜: ${SUPPORTED_FILTERS.join(', ')}`]);
      }
      
      if (errorMsg.includes('memory') || errorMsg.includes('OOM') || errorMsg.includes('out of memory')) {
        setLogs(prev => [...prev, '内存不足！请尝试更小的文件或更简单的参数']);
      }

      return { blob: null };
    } finally {
      setIsProcessing(false);
    }
  }, [isLoaded, checkFileSize]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    setError(null);
    setWarning(null);
  }, []);

  const terminate = useCallback(() => {
    if (ffmpegRef.current) {
      try {
        ffmpegRef.current.terminate();
      } catch (e) {
        console.warn('Terminate error:', e);
      }
      ffmpegRef.current = null;
      setIsLoaded(false);
    }
  }, []);

  return {
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
    terminate,
    SUPPORTED_FILTERS,
    UNSUPPORTED_FILTERS,
    MAX_RECOMMENDED_SIZE,
  };
}

function getFileExtension(filename: string): string {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0] : '.mp4';
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    gif: 'image/gif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}
