import { useRef, useCallback, useEffect, useState } from 'react';
import type { ClientMessage, ServerMessage } from '../../shared/types';
import useReplStore from '@/store/repl-store';

interface UseWebSocketReturn {
  send: (msg: ClientMessage) => void;
  connected: boolean;
  ws: WebSocket | null;
}

export default function useWebSocket(onOutput?: (data: string) => void): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOutputRef = useRef(onOutput);
  onOutputRef.current = onOutput;

  const setConnectionState = useReplStore((s) => s.setConnectionState);
  const setErrorMessage = useReplStore((s) => s.setErrorMessage);
  const setFileUpload = useReplStore((s) => s.setFileUpload);
  const resetFileUpload = useReplStore((s) => s.resetFileUpload);
  const addOutputHistory = useReplStore((s) => s.addOutputHistory);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:3001';
    const url = `${protocol}//${host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        switch (msg.type) {
          case 'output':
            onOutputRef.current?.(msg.data);
            addOutputHistory({
              type: 'output',
              content: msg.data,
              timestamp: Date.now(),
            });
            break;
          case 'status':
            setConnectionState(msg.state);
            break;
          case 'error':
            setErrorMessage(msg.message);
            break;
          case 'connected':
            setConnectionState('connected');
            break;
          case 'disconnected':
            setConnectionState('disconnected');
            break;
          case 'file_upload_progress':
            setFileUpload({
              filename: msg.filename,
              percent: msg.percent,
              status: 'uploading',
            });
            break;
          case 'file_upload_complete':
            setFileUpload({
              filename: msg.filename,
              percent: 100,
              status: 'complete',
            });
            setTimeout(() => resetFileUpload(), 2000);
            break;
          case 'file_upload_error':
            setFileUpload({
              filename: msg.filename,
              status: 'error',
              error: msg.message,
            });
            break;
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [setConnectionState, setErrorMessage, setFileUpload, resetFileUpload, addOutputHistory]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { send, connected, ws: wsRef.current };
}
