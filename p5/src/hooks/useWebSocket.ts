import { useEffect, useRef, useCallback } from 'react';
import { useGameStore, GameState, Analysis } from '../store/gameStore';

export const useWebSocket = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const {
    setGameState,
    setAnalysis,
    setIsConnected,
    setIsThinking,
    resetAnalysis,
    gameMode,
    difficulty,
    boardSize,
  } = useGameStore();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//localhost:8000/ws/game`;
    
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setIsConnected(true);
      wsRef.current?.send(JSON.stringify({
        type: 'init',
        boardSize,
        mode: gameMode,
        difficulty,
        aiColor: 'white',
      }));
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'game_state') {
        setGameState(data as GameState);
        setIsThinking(false);
      } else if (data.type === 'analysis') {
        setAnalysis(data as Analysis);
        setIsThinking(false);
      } else if (data.type === 'error') {
        console.error('WebSocket error:', data.message);
      }
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };
  }, [boardSize, gameMode, difficulty, setGameState, setAnalysis, setIsConnected, setIsThinking]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMove = useCallback((x: number, y: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setIsThinking(true);
      wsRef.current.send(JSON.stringify({
        type: 'move',
        x,
        y,
      }));
    }
  }, [setIsThinking]);

  const sendPass = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'pass',
      }));
    }
  }, []);

  const requestAnalysis = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'request_analysis',
      }));
    }
  }, []);

  const restartGame = useCallback(() => {
    resetAnalysis();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'init',
        boardSize,
        mode: gameMode,
        difficulty,
        aiColor: 'white',
      }));
    } else {
      connect();
    }
  }, [boardSize, gameMode, difficulty, resetAnalysis, connect]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { connect, disconnect, sendMove, sendPass, requestAnalysis, restartGame, isReady: wsRef.current?.readyState === WebSocket.OPEN };
};
