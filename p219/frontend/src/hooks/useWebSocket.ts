import { useRef, useCallback, useEffect, useState } from 'react';
import { ServerMessage, ClientMessage } from '../types';

interface UseWebSocketOptions {
  onMessage?: (message: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onPing?: (timestamp: number) => void;
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const sendPong = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const pongMessage: ClientMessage = {
        type: 'pong',
        payload: {
          mcu: '',
          programmer: '',
        }
      };
      wsRef.current.send(JSON.stringify(pongMessage));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        optionsRef.current.onOpen?.();
      };

      ws.onclose = () => {
        setIsConnected(false);
        optionsRef.current.onClose?.();
        
        if (reconnectTimerRef.current === null) {
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        optionsRef.current.onError?.(error);
      };

      ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          
          if (message.type === 'ping') {
            sendPong();
            optionsRef.current.onPing?.(message.payload.heartbeat || Date.now());
            return;
          }
          
          optionsRef.current.onMessage?.(message);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }, [url, sendPong]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { connect, disconnect, send, isConnected };
}
