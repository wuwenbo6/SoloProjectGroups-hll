import { useState } from 'react';
import { X, Download, Copy, Check, FileCode } from 'lucide-react';
import { useGrpcStore } from '@/store/grpcStore';

export default function ProtoExportModal() {
  const { showProtoModal, protoContent, protoExportService, setShowProtoModal } = useGrpcStore();
  const [activeFile, setActiveFile] = useState<string>('');
  const [copied, setCopied] = useState(false);

  if (!showProtoModal) return null;

  const files = Object.keys(protoContent);
  const currentFile = activeFile && files.includes(activeFile) ? activeFile : files[0] || '';
  const currentContent = currentFile ? protoContent[currentFile] || '' : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.split('/').pop() || filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    for (const [filename, content] of Object.entries(protoContent)) {
      handleDownload(filename, content);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[720px] max-h-[80vh] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
            <FileCode className="w-4 h-4 text-teal-400" />
            导出 Proto 文件 — {protoExportService}
          </span>
          <button
            onClick={() => setShowProtoModal(false)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-48 border-r border-[var(--border-color)] overflow-y-auto">
            <div className="px-3 py-2 text-xs text-[var(--text-secondary)] uppercase tracking-wider">
              文件列表
            </div>
            {files.map((f) => (
              <button
                key={f}
                onClick={() => {
                  setActiveFile(f);
                  setCopied(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-mono truncate transition-colors ${
                  f === currentFile
                    ? 'bg-teal-500/10 text-teal-400 border-r-2 border-teal-400'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {f.split('/').pop()}
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--border-color)] flex items-center justify-between">
              <span className="text-xs font-mono text-[var(--text-secondary)]">{currentFile}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-teal-400 rounded hover:bg-teal-400/10 transition-all flex items-center gap-1"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? '已复制' : '复制'}
                </button>
                <button
                  onClick={() => handleDownload(currentFile, currentContent)}
                  className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-teal-400 rounded hover:bg-teal-400/10 transition-all flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  下载
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-xs font-mono text-[var(--text-primary)] whitespace-pre leading-relaxed">
                {currentContent}
              </pre>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[var(--border-color)] flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">
            共 {files.length} 个文件
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadAll}
              className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-500 text-white text-sm font-medium rounded-lg hover:from-teal-400 hover:to-cyan-400 transition-all flex items-center gap-2 shadow-lg shadow-teal-500/20"
            >
              <Download className="w-4 h-4" />
              下载全部
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
