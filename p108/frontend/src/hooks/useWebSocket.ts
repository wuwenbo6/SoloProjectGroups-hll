import { useRef, useCallback } from 'react';
import { WSMessage } from '../types';
import { useSimulationStore } from '../store/simulationStore';

interface UseWebSocketReturn {
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: any) => void;
  isConnected: boolean;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const { setSimulationState, setIsosurfaceData, setError, addEnergyPoint } = useSimulationStore();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/simulate`;

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
    };

    wsRef.current.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error');
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket disconnected');
    };
  }, [setError]);

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'init':
        if (message.data) {
          setSimulationState({
            totalSteps: message.data.total_steps || 200,
          });
        }
        break;

      case 'step':
        if (message.data) {
          if (message.data.surface) {
            setIsosurfaceData(message.data.surface);
          }
          if (message.data.free_energy !== undefined) {
            setSimulationState({
              currentStep: message.step || 0,
              progress: message.data.progress || 0,
              freeEnergy: message.data.free_energy,
            });
            addEnergyPoint(message.step || 0, message.data.free_energy);
          }
        }
        break;

      case 'complete':
        setSimulationState({
          isRunning: false,
          progress: 1,
        });
        if (message.data?.export?.zip_path) {
          const zipPath = message.data.export.zip_path;
          const filename = zipPath.split('/').pop();
          (window as any).__lastExportZip = filename;
        }
        break;

      case 'error':
        setError(message.data?.message || 'Simulation error');
        setSimulationState({ isRunning: false });
        break;

      default:
        break;
    }
  }, [setSimulationState, setIsosurfaceData, setError, addEnergyPoint]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((msg: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return {
    connect,
    disconnect,
    sendMessage,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
