import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { RecognitionResult } from '../types';

interface UseWebSocketOptions {
  url?: string;
  onResult?: (result: RecognitionResult) => void;
  onStatus?: (status: string) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  isReady: boolean;
  error: string | null;
  sendFrames: (frames: string[], timestamp: number) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { url = 'http://localhost:9876', onResult, onStatus } = options;

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    try {
      setError(null);

      const socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      socket.on('connect', () => {
        setIsConnected(true);
        console.log('WebSocket connected');
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        setIsReady(false);
        console.log('WebSocket disconnected');
      });

      socket.on('connect_error', (err) => {
        setError(`连接失败: ${err.message}`);
        setIsConnected(false);
        console.error('WebSocket connect error:', err);
      });

      socket.on('status', (data: { status: string }) => {
        if (data.status === 'ready') {
          setIsReady(true);
        }
        if (onStatus) {
          onStatus(data.status);
        }
      });

      socket.on('result', (data: RecognitionResult) => {
        if (onResult) {
          onResult(data);
        }
      });

      socket.on('error', (data: { message: string }) => {
        setError(data.message);
      });

      socketRef.current = socket;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'WebSocket初始化失败';
      setError(message);
      console.error('WebSocket error:', err);
    }
  }, [url, onResult, onStatus]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
    setIsReady(false);
  }, []);

  const sendFrames = useCallback((frames: string[], timestamp: number) => {
    if (!socketRef.current || !isConnected) {
      return;
    }

    socketRef.current.emit('frames', { frames, timestamp });
  }, [isConnected]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isReady,
    error,
    sendFrames,
    connect,
    disconnect
  };
}
