import { useEffect, useRef, useCallback } from 'react';
import { useUploadStore } from '@/stores/uploadStore';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const setWsConnected = useUploadStore((s) => s.setWsConnected);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUploadIdRef = useRef<string>('');

  const updateProgress = useUploadStore((s) => s.updateProgress);
  const setCurrentUpload = useUploadStore((s) => s.setCurrentUpload);
  const setObserverCount = useUploadStore((s) => s.setObserverCount);
  const setCompletedFiles = useUploadStore((s) => s.setCompletedFiles);
  const addCoapNotification = useUploadStore((s) => s.addCoapNotification);

  useUploadStore.subscribe((state) => {
    if (state.currentUpload) {
      currentUploadIdRef.current = state.currentUpload.id;
    }
  });

  const fetchObserveStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/coap/observe');
      const data = await res.json();
      if (data.success) {
        setObserverCount(data.data.observerCount);
        setCompletedFiles(data.data.completedFiles);
      }
    } catch {}
  }, [setObserverCount, setCompletedFiles]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
      setWsConnected(true);
      fetchObserveStatus();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'progress' && msg.data.id === currentUploadIdRef.current) {
          setCurrentUpload(msg.data);
        }
        if (msg.type === 'observe' && msg.data) {
          addCoapNotification({
            type: String(msg.data.type || ''),
            uploadId: String(msg.data.uploadId || ''),
            blockNum: Number(msg.data.blockNum ?? 0),
            timestamp: Number(msg.data.timestamp ?? Date.now()),
          });
          fetchObserveStatus();
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      setWsConnected(false);
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      ws.close();
    };
  }, [setWsConnected, setCurrentUpload, fetchObserveStatus, addCoapNotification]);

  useEffect(() => {
    connect();

    const interval = setInterval(fetchObserveStatus, 10000);

    return () => {
      clearInterval(interval);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, fetchObserveStatus]);

  return wsRef;
}
