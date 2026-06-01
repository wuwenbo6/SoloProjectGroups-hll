import { useState, useEffect } from 'react';
import { X, Download, FileVideo, Check, AlertCircle, Loader } from 'lucide-react';
import { api } from '../utils/api.js';
import { formatFileSize } from '../utils/format.js';
import type { ExportTask, ExportOptions, Recording } from '../../shared/types.js';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  recording: Recording;
}

export function ExportDialog({ isOpen, onClose, recording }: ExportDialogProps) {
  const [format, setFormat] = useState<'avi' | 'mp4'>('avi');
  const [quality, setQuality] = useState<'high' | 'medium' | 'low'>('medium');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [exportTask, setExportTask] = useState<ExportTask | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (exportTask && exportTask.status === 'processing') {
      const interval = setInterval(async () => {
        try {
          const task = await api.getExportTask(exportTask.id) as ExportTask;
          setExportTask(task);
          if (task.status === 'completed' || task.status === 'failed') {
            clearInterval(interval);
            setIsExporting(false);
          }
        } catch (error) {
          console.error('Failed to poll export task:', error);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [exportTask?.status]);

  async function handleExport() {
    setIsExporting(true);
    try {
      const options: ExportOptions = {
        format,
        includeAudio,
        quality,
      };
      const task = await api.createExport(recording.id, options) as ExportTask;
      setExportTask(task);
    } catch (error) {
      console.error('Failed to start export:', error);
      setIsExporting(false);
    }
  }

  function handleDownload() {
    if (exportTask) {
      window.open(api.getExportDownloadUrl(exportTask.id), '_blank');
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl w-full max-w-md border border-slate-800">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Download className="text-green-400" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">导出录像</h3>
              <p className="text-sm text-slate-500">选择格式和质量</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {!exportTask ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-3">导出格式</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormat('avi')}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      format === 'avi'
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <FileVideo size={24} className={format === 'avi' ? 'text-green-400' : 'text-slate-500'} />
                    <div className="text-white font-medium mt-2">AVI</div>
                    <div className="text-xs text-slate-500 mt-0.5">XVID编码，兼容性好</div>
                  </button>
                  <button
                    onClick={() => setFormat('mp4')}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      format === 'mp4'
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <FileVideo size={24} className={format === 'mp4' ? 'text-green-400' : 'text-slate-500'} />
                    <div className="text-white font-medium mt-2">MP4</div>
                    <div className="text-xs text-slate-500 mt-0.5">H.264编码，体积小</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-3">画质</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'high', label: '高质量', desc: '8Mbps' },
                    { value: 'medium', label: '中等', desc: '4Mbps' },
                    { value: 'low', label: '低质量', desc: '2Mbps' },
                  ].map((q) => (
                    <button
                      key={q.value}
                      onClick={() => setQuality(q.value as any)}
                      className={`p-3 rounded-lg border text-center transition-colors ${
                        quality === q.value
                          ? 'border-green-500 bg-green-500/10 text-green-400'
                          : 'border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-sm font-medium">{q.label}</div>
                      <div className="text-xs mt-0.5 opacity-70">{q.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <span className="text-sm text-slate-400">包含音频</span>
                <button
                  onClick={() => setIncludeAudio(!includeAudio)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    includeAudio ? 'bg-green-500' : 'bg-slate-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      includeAudio ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex-1 px-4 py-3 rounded-xl bg-green-500 text-white font-medium hover:bg-green-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Download size={16} />
                  {isExporting ? '导出中...' : '开始导出'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {exportTask.status === 'processing' && (
                  <Loader size={24} className="text-cyan-400 animate-spin" />
                )}
                {exportTask.status === 'completed' && (
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check size={20} className="text-green-400" />
                  </div>
                )}
                {exportTask.status === 'failed' && (
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <AlertCircle size={20} className="text-red-400" />
                  </div>
                )}
                <div>
                  <div className="text-white font-medium">
                    {exportTask.status === 'processing' && '正在转换...'}
                    {exportTask.status === 'completed' && '导出完成'}
                    {exportTask.status === 'failed' && '导出失败'}
                  </div>
                  {exportTask.status === 'processing' && (
                    <div className="text-sm text-slate-400">{exportTask.progress}%</div>
                  )}
                  {exportTask.status === 'completed' && exportTask.fileSize && (
                    <div className="text-sm text-slate-400">{formatFileSize(exportTask.fileSize)}</div>
                  )}
                </div>
              </div>

              {exportTask.status === 'processing' && (
                <div className="w-full bg-slate-800 rounded-full h-2.5">
                  <div
                    className="bg-cyan-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${exportTask.progress}%` }}
                  />
                </div>
              )}

              <div className="flex gap-3">
                {exportTask.status === 'completed' && (
                  <button
                    onClick={handleDownload}
                    className="flex-1 px-4 py-3 rounded-xl bg-green-500 text-white font-medium hover:bg-green-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download size={16} />
                    下载 {format.toUpperCase()}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors"
                >
                  {exportTask.status === 'completed' ? '关闭' : '后台继续'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
