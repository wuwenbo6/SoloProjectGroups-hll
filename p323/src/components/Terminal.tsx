import { useRef, useEffect } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import useReplStore from '@/store/repl-store';
import type { ClientMessage } from '../../shared/types';

interface TerminalProps {
  send: (msg: ClientMessage) => void;
  terminalRef?: React.MutableRefObject<XTerm | null>;
  pasteMode?: boolean;
}

export default function Terminal({ send, terminalRef: externalRef, pasteMode = false }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const historyIndexRef = useRef(-1);
  const currentLineRef = useRef('');
  const pasteModeRef = useRef(pasteMode);
  pasteModeRef.current = pasteMode;

  const addCommandHistory = useReplStore((s) => s.addCommandHistory);
  const commandHistory = useReplStore((s) => s.commandHistory);

  const commandHistoryRef = useRef(commandHistory);
  commandHistoryRef.current = commandHistory;

  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    if (!containerRef.current) return;
    if (xtermRef.current) return;

    const xterm = new XTerm({
      theme: {
        background: '#0a0e17',
        foreground: '#00ff88',
        cursor: '#00ff88',
        cursorAccent: '#0a0e17',
        selectionBackground: 'rgba(0, 255, 136, 0.3)',
        selectionForeground: '#0a0e17',
        black: '#0a0e17',
        red: '#ff5f56',
        green: '#00ff88',
        yellow: '#ffbd2e',
        blue: '#0ea5e9',
        magenta: '#c792ea',
        cyan: '#00d4ff',
        white: '#e0e0e0',
        brightBlack: '#4a4a4a',
        brightRed: '#ff5f56',
        brightGreen: '#00ff88',
        brightYellow: '#ffbd2e',
        brightBlue: '#0ea5e9',
        brightMagenta: '#c792ea',
        brightCyan: '#00d4ff',
        brightWhite: '#ffffff',
      },
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.open(containerRef.current);

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch { /* ignore fit errors */ }
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    if (externalRef) {
      externalRef.current = xterm;
    }

    xterm.onKey(({ key, domEvent }) => {
      const ev = domEvent;

      if (ev.ctrlKey) {
        if (ev.key === 'c') {
          sendRef.current({ type: 'interrupt' });
          return;
        }
        if (ev.key === 'd') {
          sendRef.current({ type: 'soft_reset' });
          return;
        }
      }

      if (ev.key === 'Enter') {
        const line = currentLineRef.current;
        if (line.trim()) {
          addCommandHistory(line);
        }
        sendRef.current({ type: 'command', data: '\r' });
        historyIndexRef.current = -1;
        currentLineRef.current = '';
        return;
      }

      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        const history = commandHistoryRef.current;
        if (history.length === 0) return;

        if (historyIndexRef.current < history.length - 1) {
          historyIndexRef.current += 1;
          const cmd = history[history.length - 1 - historyIndexRef.current];
          if (currentLineRef.current.length > 0) {
            xterm.write('\b \b'.repeat(currentLineRef.current.length));
          }
          xterm.write(cmd);
          sendRef.current({ type: 'command', data: cmd });
          currentLineRef.current = cmd;
        }
        return;
      }

      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        const history = commandHistoryRef.current;
        if (currentLineRef.current.length > 0) {
          xterm.write('\b \b'.repeat(currentLineRef.current.length));
        }

        if (historyIndexRef.current > 0) {
          historyIndexRef.current -= 1;
          const cmd = history[history.length - 1 - historyIndexRef.current];
          xterm.write(cmd);
          sendRef.current({ type: 'command', data: cmd });
          currentLineRef.current = cmd;
        } else {
          historyIndexRef.current = -1;
          currentLineRef.current = '';
        }
        return;
      }

      if (ev.key === 'Backspace') {
        if (currentLineRef.current.length > 0) {
          currentLineRef.current = currentLineRef.current.slice(0, -1);
        }
        sendRef.current({ type: 'command', data: key });
        return;
      }

      if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        currentLineRef.current += key;
        sendRef.current({ type: 'command', data: key });
      }
    });

    xterm.attachCustomKeyEventHandler((event) => {
      if (event.ctrlKey && event.key === 'v') {
        return true;
      }
      return false;
    });

    const handlePaste = (event: ClipboardEvent) => {
      event.preventDefault();
      const text = event.clipboardData?.getData('text') || '';
      if (!text) return;

      if (pasteModeRef.current) {
        sendRef.current({ type: 'command', data: text });
        addCommandHistory(text);
      } else {
        const lines = text.split('\n');
        lines.forEach((line, index) => {
          sendRef.current({ type: 'command', data: line });
          if (index < lines.length - 1) {
            sendRef.current({ type: 'command', data: '\r' });
          }
        });
        if (text.endsWith('\n')) {
          sendRef.current({ type: 'command', data: '\r' });
        }
      }
    };

    containerRef.current.addEventListener('paste', handlePaste);

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
        } catch { /* ignore fit errors */ }
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      containerRef.current?.removeEventListener('paste', handlePaste);
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      if (externalRef) {
        externalRef.current = null;
      }
    };
  }, [addCommandHistory, externalRef]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full terminal-container"
    />
  );
}
