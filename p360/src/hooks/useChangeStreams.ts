import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ChangeEvent,
  ServerMessage,
  ConnectMessage,
  ConnectedMessage,
  EventMessage,
  ResumeCompleteMessage,
  TokenErrorMessage,
  FilterUpdateMessage,
  SetFilterMessage,
  ResumeTokenError,
  OpTime,
  MatchFilter,
} from '../../shared/types.js';

export interface UseChangeStreamsOptions {
  url?: string;
  autoReconnect?: boolean;
  autoReconnectInterval?: number;
}

export function useChangeStreams(options: UseChangeStreamsOptions = {}) {
  const {
    url = '/ws',
    autoReconnect = true,
    autoReconnectInterval = 2000,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isManuallyDisconnected, setIsManuallyDisconnected] = useState(false);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [missedEventCount, setMissedEventCount] = useState<number | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [resumedCount, setResumedCount] = useState(0);
  const [tokenError, setTokenError] = useState<ResumeTokenError | null>(null);
  const [currentTerm, setCurrentTerm] = useState<number | null>(null);
  const [currentOptime, setCurrentOptime] = useState<OpTime | null>(null);
  const [filter, setFilter] = useState<MatchFilter | null>(null);
  const [matchedCount, setMatchedCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const filterRef = useRef<MatchFilter | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      wsRef.current = new WebSocket(url);
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      scheduleReconnect();
      return;
    }

    wsRef.current.onopen = () => {
      const message: ConnectMessage = {
        type: 'connect',
        resumeAfter: lastToken || undefined,
        filter: filterRef.current || undefined,
      };
      wsRef.current?.send(JSON.stringify(message));
      setIsConnected(true);
      setIsManuallyDisconnected(false);
      setIsResuming(!!lastToken);
      setResumedCount(0);
      setTokenError(null);
    };

    wsRef.current.onmessage = (e) => {
      try {
        const msg: ServerMessage = JSON.parse(e.data);

        if (msg.type === 'connected') {
          const connectedMsg = msg as ConnectedMessage;
          setMissedEventCount(connectedMsg.missedEventCount ?? null);
          if (connectedMsg.currentTerm) setCurrentTerm(connectedMsg.currentTerm);
          if (connectedMsg.currentOptime) setCurrentOptime(connectedMsg.currentOptime);
          if (connectedMsg.error) {
            setTokenError(connectedMsg.error);
          }
        } else if (msg.type === 'change') {
          const eventMsg = msg as EventMessage;
          setLastToken(eventMsg.event._id._data);
          setEvents((prev) => [eventMsg.event, ...prev]);
          if (eventMsg.isResumed) {
            setResumedCount((prev) => prev + 1);
          }
          setTokenError(null);
          if (eventMsg.event._id._term) {
            setCurrentTerm(eventMsg.event._id._term);
          }
          if (eventMsg.event._id._optime) {
            setCurrentOptime(eventMsg.event._id._optime);
          }
        } else if (msg.type === 'resumeComplete') {
          setIsResuming(false);
        } else if (msg.type === 'tokenError') {
          const tokenErrMsg = msg as TokenErrorMessage;
          setTokenError(tokenErrMsg.error);
          setIsResuming(false);
        } else if (msg.type === 'filterUpdated') {
          const filterMsg = msg as FilterUpdateMessage;
          setFilter(filterMsg.filter);
          setMatchedCount(filterMsg.matchedCount);
          filterRef.current = filterMsg.filter;
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
      setIsResuming(false);
      if (autoReconnect && !isManuallyDisconnected) {
        scheduleReconnect();
      }
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [url, lastToken, autoReconnect, isManuallyDisconnected]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    reconnectTimerRef.current = setTimeout(() => {
      if (!isManuallyDisconnected) {
        connect();
      }
    }, autoReconnectInterval);
  }, [autoReconnectInterval, isManuallyDisconnected, connect]);

  const disconnect = useCallback(() => {
    setIsManuallyDisconnected(true);
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsResuming(false);
  }, []);

  const reconnect = useCallback(() => {
    setIsManuallyDisconnected(false);
    setTokenError(null);
    connect();
  }, [connect]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setMissedEventCount(null);
    setResumedCount(0);
  }, []);

  const resetToken = useCallback(() => {
    setLastToken(null);
    setTokenError(null);
  }, []);

  const clearTokenError = useCallback(() => {
    setTokenError(null);
  }, []);

  const setFilterAndSend = useCallback((newFilter: MatchFilter | null) => {
    filterRef.current = newFilter;
    setFilter(newFilter);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: SetFilterMessage = {
        type: 'setFilter',
        filter: newFilter,
      };
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    isConnected,
    isManuallyDisconnected,
    isResuming,
    lastToken,
    events,
    missedEventCount,
    resumedCount,
    tokenError,
    currentTerm,
    currentOptime,
    filter,
    matchedCount,
    connect,
    disconnect,
    reconnect,
    clearEvents,
    resetToken,
    clearTokenError,
    setFilter: setFilterAndSend,
  };
}
