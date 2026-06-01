import { useState } from 'react';
import { Trash2, XCircle, RotateCcw, TerminalSquare, Copy, FileUp, Download } from 'lucide-react';
import type { Terminal as XTerm } from '@xterm/xterm';
import type { ClientMessage } from '../../shared/types';
import useReplStore from '@/store/repl-store';
import { cn } from '@/lib/utils';

interface ToolbarProps {
  send: (msg: ClientMessage) => void;
  terminalRef: React.MutableRefObject<XTerm | null>;
  pasteMode: boolean;
  onPasteModeToggle: () => void;
  onFileUpload: () => void;
  onExportHistory: () => void;
}

export default function Toolbar({ send, terminalRef, pasteMode, onPasteModeToggle, onFileUpload, onExportHistory }: ToolbarProps) {
  const connectionState = useReplStore((s) => s.connectionState);
  const fileUpload = useReplStore((s) => s.fileUpload);
  const [copied, setCopied] = useState(false);

  const handleClear = () => {
    terminalRef.current?.clear();
  };

  const handleInterrupt = () => {
    send({ type: 'interrupt' });
  };

  const handleSoftReset = () => {
    send({ type: 'soft_reset' });
  };

  const handlePasteModeToggle = () => {
    onPasteModeToggle();
  };

  const handleCopy = async () => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const selection = terminal.getSelection();
    if (selection) {
      try {
        await navigator.clipboard.writeText(selection);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch { /* ignore clipboard errors */ }
    }
  };

  const statusColor = {
    disconnected: 'bg-gray-500',
    connecting: 'bg-yellow-400 animate-pulse',
    connected: 'bg-terminal-fg',
    error: 'bg-red-500',
  }[connectionState];

  const statusLabel = {
    disconnected: '未连接',
    connecting: '连接中',
    connected: '已连接',
    error: '错误',
  }[connectionState];

  return (
    <div className="flex items-center justify-between h-10 px-3 bg-terminal-surface/80 border-b border-terminal-border shrink-0">
      <div className="flex items-center gap-1">
        <ToolButton
          icon={<Trash2 size={15} />}
          label="清屏"
          onClick={handleClear}
        />
        <ToolButton
          icon={<XCircle size={15} />}
          label="中断 (Ctrl+C)"
          onClick={handleInterrupt}
        />
        <ToolButton
          icon={<RotateCcw size={15} />}
          label="软复位 (Ctrl+D)"
          onClick={handleSoftReset}
        />
        <ToolButton
          icon={<TerminalSquare size={15} />}
          label={pasteMode ? '粘贴模式: 开' : '粘贴模式: 关'}
          onClick={handlePasteModeToggle}
          active={pasteMode}
        />
        <ToolButton
          icon={<Copy size={15} />}
          label={copied ? '已复制!' : '复制选区'}
          onClick={handleCopy}
        />
        <div className="w-px h-5 bg-terminal-border mx-1" />
        <ToolButton
          icon={<FileUp size={15} />}
          label="上传文件"
          onClick={onFileUpload}
          active={fileUpload.status === 'uploading'}
          badge={fileUpload.status === 'uploading' ? fileUpload.percent : undefined}
        />
        <ToolButton
          icon={<Download size={15} />}
          label="导出历史"
          onClick={onExportHistory}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className={cn('w-2 h-2 rounded-full', statusColor)} />
        <span className="text-xs text-gray-400">{statusLabel}</span>
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
  active = false,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'relative flex items-center justify-center w-8 h-8 rounded-md transition-all',
        active
          ? 'bg-terminal-fg/20 text-terminal-fg shadow-[0_0_8px_rgba(0,255,136,0.2)]'
          : 'text-gray-500 hover:text-terminal-fg hover:bg-terminal-fg/10 hover:shadow-[0_0_8px_rgba(0,255,136,0.1)]'
      )}
    >
      {icon}
      {badge !== undefined && (
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-terminal-fg text-[9px] font-bold text-terminal-bg flex items-center justify-center">
          {badge}
        </div>
      )}
    </button>
  );
}

export { ToolButton };
