import { useRef, useState, useCallback } from 'react';
import { Menu, X } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import useWebSocket from '@/hooks/useWebSocket';
import ConnectionPanel from '@/components/ConnectionPanel';
import TerminalComponent from '@/components/Terminal';
import Toolbar from '@/components/Toolbar';
import FileUploadDialog from '@/components/FileUploadDialog';
import useReplStore from '@/store/repl-store';
import type { ClientMessage } from '../../shared/types';

export default function Home() {
  const terminalRef = useRef<XTerm | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [fileUploadDialogOpen, setFileUploadDialogOpen] = useState(false);
  const connectionState = useReplStore((s) => s.connectionState);
  const outputHistory = useReplStore((s) => s.outputHistory);
  const commandHistory = useReplStore((s) => s.commandHistory);
  const fileUpload = useReplStore((s) => s.fileUpload);
  const addOutputHistory = useReplStore((s) => s.addOutputHistory);

  const detectAndHighlightError = (data: string): string => {
    const errorPatterns = [
      /Traceback \(most recent call last\):/gi,
      /\w+Error:/gi,
      /MemoryError/gi,
      /ImportError/gi,
      /NameError/gi,
      /TypeError/gi,
      /ValueError/gi,
      /IndexError/gi,
      /KeyError/gi,
      /SyntaxError/gi,
      /IndentationError/gi,
      /AttributeError/gi,
      /OSError/gi,
      /RuntimeError/gi,
    ];
    let highlighted = data;
    for (const pattern of errorPatterns) {
      highlighted = highlighted.replace(pattern, '\x1b[31m$&\x1b[32m');
    }
    return highlighted;
  };

  const onOutput = useCallback((data: string) => {
    const highlighted = detectAndHighlightError(data);
    terminalRef.current?.write(highlighted);
  }, []);

  const { send } = useWebSocket(onOutput);

  const handleConnect = (msg: ClientMessage) => {
    send(msg);
  };

  const handleDisconnect = () => {
    send({ type: 'disconnect' });
  };

  const handlePasteModeToggle = () => {
    setPasteMode(prev => !prev);
  };

  const handleSendWithHistory = (msg: ClientMessage) => {
    if (msg.type === 'command' && msg.data.trim() && msg.data !== '\r') {
      addOutputHistory({
        type: 'input',
        content: msg.data,
        timestamp: Date.now(),
      });
    }
    send(msg);
  };

  const handleExportHistory = () => {
    const formatTimestamp = (ts: number) => {
      const date = new Date(ts);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    };

    let content = `# MicroPython REPL 执行历史记录\n`;
    content += `# 导出时间: ${formatTimestamp(Date.now())}\n`;
    content += `# 连接状态: ${connectionState}\n`;
    content += `\n`;
    content += `## 命令历史 (最近 ${commandHistory.length} 条)\n`;
    commandHistory.forEach((cmd, i) => {
      content += `${i + 1}. ${cmd}\n`;
    });
    content += `\n`;
    content += `## 完整会话记录\n`;
    outputHistory.forEach((entry) => {
      const prefix = entry.type === 'input' ? '>>> ' : '';
      content += `[${formatTimestamp(entry.timestamp)}] ${prefix}${entry.content}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `micropython-repl-history-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen bg-terminal-bg overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <FileUploadDialog
        open={fileUploadDialogOpen}
        onClose={() => setFileUploadDialogOpen(false)}
        send={send}
        isConnected={connectionState === 'connected'}
        uploadProgress={fileUpload.percent}
        uploadStatus={fileUpload.status}
        uploadError={fileUpload.error}
      />

      <aside
        className={`
          fixed lg:relative z-30 h-full w-80
          bg-terminal-surface/95 backdrop-blur-sm border-r border-terminal-border
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border lg:hidden">
          <span className="text-sm font-semibold text-terminal-fg/80">连接</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-gray-400 hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>
        <ConnectionPanel onConnect={handleConnect} onDisconnect={handleDisconnect} />
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center h-10 px-3 bg-terminal-surface/50 border-b border-terminal-border lg:hidden shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-terminal-fg transition-colors"
          >
            <Menu size={18} />
          </button>
          <span className="ml-3 text-xs text-gray-500">
            MicroPython REPL
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                connectionState === 'connected'
                  ? 'bg-terminal-fg'
                  : connectionState === 'connecting'
                  ? 'bg-yellow-400 animate-pulse'
                  : connectionState === 'error'
                  ? 'bg-red-500'
                  : 'bg-gray-500'
              }`}
            />
          </div>
        </div>

        <Toolbar
          send={send}
          terminalRef={terminalRef}
          pasteMode={pasteMode}
          onPasteModeToggle={handlePasteModeToggle}
          onFileUpload={() => setFileUploadDialogOpen(true)}
          onExportHistory={handleExportHistory}
        />

        <div className="flex-1 min-h-0 p-1">
          <TerminalComponent send={handleSendWithHistory} terminalRef={terminalRef} pasteMode={pasteMode} />
        </div>
      </main>
    </div>
  );
}
