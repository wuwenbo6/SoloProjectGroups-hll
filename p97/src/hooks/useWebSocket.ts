import { useState, useCallback, useRef, useEffect } from 'react';
import { eegCacheDB, CachedEEGData, CachedDetectionResult } from '../utils/indexedDB';

export interface DetectionResult {
  timestamp: number;
  isSeizure: boolean;
  confidence: number;
  rawConfidence?: number;
  seizureType?: string;
  hasArtifact?: boolean;
  artifactType?: 'emg' | 'eog' | null;
  artifactScore?: number;
  emgScore?: number;
  eogScore?: number;
  emgChannelScores?: number[];
}

export interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  syncedCount: number;
}

export function useWebSocket(url: string = 'ws://localhost:8000/ws/eeg') {
  const [isConnected, setIsConnected] = useState(false);
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    pendingCount: 0,
    syncedCount: 0
  });
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isSyncingRef = useRef(false);

  const syncCachedData = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    
    try {
      setSyncStatus(prev => ({ ...prev, isSyncing: true }));
      
      const unsyncedEEG = await eegCacheDB.getUnsyncedEEGData();
      const unsyncedDetections = await eegCacheDB.getUnsyncedDetectionResults();
      
      setSyncStatus(prev => ({ ...prev, pendingCount: unsyncedEEG.length }));
      
      if (unsyncedEEG.length === 0 && unsyncedDetections.length === 0) {
        setSyncStatus({ isSyncing: false, pendingCount: 0, syncedCount: 0 });
        isSyncingRef.current = false;
        return;
      }
      
      const batchSize = 50;
      let syncedCount = 0;
      
      for (let i = 0; i < unsyncedEEG.length; i += batchSize) {
        const batch = unsyncedEEG.slice(i, i + batchSize);
        
        for (const data of batch) {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              timestamp: data.timestamp,
              channelData: data.channelData,
              samplingRate: data.samplingRate,
              isCached: true
            }));
            syncedCount++;
            setSyncStatus(prev => ({ ...prev, syncedCount }));
          }
        }
        
        const syncedIds = batch.map(d => d._id!).filter(id => id !== undefined);
        await eegCacheDB.markEEGDataSynced(syncedIds);
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      await eegCacheDB.clearSyncedData();
      
      setSyncStatus({
        isSyncing: false,
        pendingCount: 0,
        syncedCount
      });
      
    } catch (err) {
      console.error('Sync error:', err);
      setSyncStatus(prev => ({ ...prev, isSyncing: false }));
    }
    
    isSyncingRef.current = false;
  }, []);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = async () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        await syncCachedData();
      };

      ws.onmessage = (event) => {
        try {
          const data: DetectionResult = JSON.parse(event.data);
          setDetectionResult(data);
          
          eegCacheDB.addDetectionResult(data).catch(err => 
            console.error('Failed to cache detection result:', err)
          );
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket连接错误');
      };

      ws.onclose = () => {
        setIsConnected(false);
        
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      };

      wsRef.current = ws;
    } catch (e) {
      setError('无法建立WebSocket连接');
      console.error('WebSocket connection error:', e);
    }
  }, [url, syncCachedData]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    reconnectAttemptsRef.current = 0;
  }, []);

  const sendData = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
    
    eegCacheDB.addEEGData(data).catch(err => 
      console.error('Failed to cache EEG data:', err)
    );
  }, []);

  const updatePendingCount = useCallback(async () => {
    const counts = await eegCacheDB.getPendingCount();
    setSyncStatus(prev => ({ ...prev, pendingCount: counts.eegCount }));
  }, []);

  useEffect(() => {
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, [updatePendingCount]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    detectionResult,
    error,
    syncStatus,
    connect,
    disconnect,
    sendData,
    syncCachedData,
    updatePendingCount
  };
}
