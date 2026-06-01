import { useState, useCallback, useRef } from 'react';
import { Layer, HistoryState } from '../types';

const MAX_HISTORY = 50;

export function useHistory(_initialLayers: Layer[] = []) {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isRestoringRef = useRef(false);

  const pushHistory = useCallback((layers: Layer[], description: string) => {
    if (isRestoringRef.current) return;

    const newState: HistoryState = {
      layers: JSON.parse(JSON.stringify(layers.map(l => ({
        ...l,
        imageData: null,
      })))),
      timestamp: Date.now(),
      description,
    };

    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newState);
      
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
        return newHistory;
      }
      
      return newHistory;
    });

    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIndex]);

  const undo = useCallback((): HistoryState | null => {
    if (historyIndex <= 0) return null;
    
    isRestoringRef.current = true;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    
    setTimeout(() => {
      isRestoringRef.current = false;
    }, 0);
    
    return history[newIndex] || null;
  }, [history, historyIndex]);

  const redo = useCallback((): HistoryState | null => {
    if (historyIndex >= history.length - 1) return null;
    
    isRestoringRef.current = true;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    
    setTimeout(() => {
      isRestoringRef.current = false;
    }, 0);
    
    return history[newIndex] || null;
  }, [history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  return {
    history,
    historyIndex,
    pushHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
  };
}
