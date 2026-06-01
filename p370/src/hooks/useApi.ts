import { useEffect, useRef, useCallback } from 'react';
import { useStore } from './useStore';
import type { LogEntry, Statistics, TargetStatus } from './useStore';

export function useWebSocket() {
  const logWsRef = useRef<WebSocket | null>(null);
  const statsWsRef = useRef<WebSocket | null>(null);
  const { setStatus, setStats, addLog } = useStore();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    logWsRef.current = new WebSocket(`${protocol}//${host}/ws/logs`);
    logWsRef.current.onmessage = (event) => {
      try {
        const log: LogEntry = JSON.parse(event.data);
        addLog(log);
      } catch {}
    };
    logWsRef.current.onclose = () => {
      setTimeout(() => {
        if (logWsRef.current) connect();
      }, 3000);
    };

    statsWsRef.current = new WebSocket(`${protocol}//${host}/ws/stats`);
    statsWsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.statistics) {
          setStats(data.statistics as Partial<Statistics>);
        }
        if (data.status) {
          setStatus(data.status as Partial<TargetStatus>);
        }
      } catch {}
    };
    statsWsRef.current.onclose = () => {
      setTimeout(() => {
        if (statsWsRef.current) connect();
      }, 3000);
    };
  }, [addLog, setStatus, setStats]);

  useEffect(() => {
    connect();
    return () => {
      logWsRef.current?.close();
      statsWsRef.current?.close();
    };
  }, [connect]);
}

const API_BASE = '/api';

export async function apiPost(path: string, body?: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export async function apiGet(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  return res.json();
}
