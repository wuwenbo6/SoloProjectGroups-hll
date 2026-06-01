import { useState, useEffect, useCallback, useRef } from 'react';
import type { SystemStatus, SlotStatus, TempSensor, HealthStatus, ApiResponse, LedType, LedAction, LedMode, LedModeInfo, DiagnosticLogs } from '@/types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetchJson<ApiResponse<T>>(url);
  if (!response.success) {
    throw new Error(response.error || 'API request failed');
  }
  return response.data as T;
}

export function useApi() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const intervalRef = useRef<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<SystemStatus>('/status');
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Failed to fetch status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await fetchJson<HealthStatus>('/health');
      setHealth(data);
    } catch (err) {
      console.error('Failed to fetch health:', err);
    }
  }, []);

  const fetchSlots = useCallback(async (): Promise<SlotStatus[]> => {
    return apiGet<SlotStatus[]>('/slots');
  }, []);

  const fetchSlot = useCallback(async (slot: number): Promise<SlotStatus> => {
    return apiGet<SlotStatus>(`/slots/${slot}`);
  }, []);

  const fetchTemperature = useCallback(async (): Promise<TempSensor[]> => {
    return apiGet<TempSensor[]>('/temperature');
  }, []);

  const setLed = useCallback(async (slot: number, type: LedType, action: LedAction): Promise<void> => {
    const response = await fetchJson<ApiResponse<null>>(
      `/led/${slot}/${type}/${action}`,
      { method: 'POST' }
    );
    if (!response.success) {
      throw new Error(response.error || 'Failed to set LED');
    }
    await fetchStatus();
  }, [fetchStatus]);

  const setLedMode = useCallback(async (slot: number, type: LedType, mode: LedMode): Promise<void> => {
    const response = await fetchJson<ApiResponse<null>>(
      `/led/mode/${slot}/${type}/${mode}`,
      { method: 'POST' }
    );
    if (!response.success) {
      throw new Error(response.error || 'Failed to set LED mode');
    }
    await fetchStatus();
  }, [fetchStatus]);

  const fetchLedModes = useCallback(async (): Promise<LedModeInfo> => {
    return apiGet<LedModeInfo>('/led/modes');
  }, []);

  const fetchDiagnostics = useCallback(async (format: 'json' | 'text' = 'json'): Promise<DiagnosticLogs | string> => {
    if (format === 'text') {
      const response = await fetch(`${API_BASE}/diagnostics?format=text`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.text();
    }
    return apiGet<DiagnosticLogs>('/diagnostics');
  }, []);

  const downloadDiagnostics = useCallback(async (format: 'json' | 'text' = 'json'): Promise<void> => {
    const url = `${API_BASE}/diagnostics?format=${format}&download=true`;
    window.open(url, '_blank');
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchStatus();
  }, [fetchHealth, fetchStatus]);

  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      intervalRef.current = window.setInterval(fetchStatus, refreshInterval);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, refreshInterval, fetchStatus]);

  return {
    status,
    health,
    loading,
    error,
    autoRefresh,
    refreshInterval,
    setAutoRefresh,
    setRefreshInterval,
    fetchStatus,
    fetchHealth,
    fetchSlots,
    fetchSlot,
    fetchTemperature,
    setLed,
    setLedMode,
    fetchLedModes,
    fetchDiagnostics,
    downloadDiagnostics,
  };
}
