import { useEffect, useCallback } from 'react';
import { useDmrStore } from '@/store/useDmrStore';
import type { WavFileInfo, DemodulationConfig } from '@/types';

export function useDmrAnalysis() {
  const {
    fileInfo,
    config,
    isAnalyzing,
    progress,
    result,
    error,
    setFileInfo,
    setIsAnalyzing,
    setProgress,
    setResult,
    setError,
    reset,
  } = useDmrStore();

  const selectFile = useCallback(async (): Promise<WavFileInfo | null> => {
    if (!window.electronAPI) {
      const mockInfo: WavFileInfo = {
        path: '/mock/test.wav',
        name: 'test_recording.wav',
        sampleRate: 48000,
        channels: 1,
        bitsPerSample: 16,
        duration: 120,
        size: 11520000,
      };
      setFileInfo(mockInfo);
      return mockInfo;
    }

    try {
      const info = await window.electronAPI.selectFile();
      if (info) {
        setFileInfo(info);
        setResult(null);
        setError(null);
      }
      return info;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select file');
      return null;
    }
  }, [setFileInfo, setResult, setError]);

  const startAnalysis = useCallback(async (filePath: string, analysisConfig: DemodulationConfig) => {
    setIsAnalyzing(true);
    setProgress(null);
    setResult(null);
    setError(null);

    if (!window.electronAPI) {
      await simulateAnalysis(setProgress, setResult, setIsAnalyzing);
      return;
    }

    try {
      await window.electronAPI.startAnalysis(filePath, analysisConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
      setIsAnalyzing(false);
    }
  }, [setIsAnalyzing, setProgress, setResult, setError]);

  const cancelAnalysis = useCallback(async () => {
    if (!window.electronAPI) {
      setIsAnalyzing(false);
      setProgress(null);
      return;
    }

    try {
      await window.electronAPI.cancelAnalysis();
    } catch (err) {
      console.error('Failed to cancel analysis:', err);
    }
  }, [setIsAnalyzing, setProgress]);

  useEffect(() => {
    if (!window.electronAPI) return;

    const cleanupProgress = window.electronAPI.onProgress((p) => {
      setProgress(p);
    });

    const cleanupComplete = window.electronAPI.onComplete((r) => {
      setResult(r);
      setIsAnalyzing(false);
    });

    const cleanupError = window.electronAPI.onError((e) => {
      setError(e.message);
      setIsAnalyzing(false);
    });

    return () => {
      cleanupProgress();
      cleanupComplete();
      cleanupError();
    };
  }, [setProgress, setResult, setIsAnalyzing, setError]);

  return {
    fileInfo,
    config,
    isAnalyzing,
    progress,
    result,
    error,
    selectFile,
    startAnalysis,
    cancelAnalysis,
    reset,
  };
}

async function simulateAnalysis(
  setProgress: (p: any) => void,
  setResult: (r: any) => void,
  setIsAnalyzing: (a: boolean) => void
) {
  const phases: Array<'reading' | 'demodulating' | 'parsing' | 'complete'> = ['reading', 'demodulating', 'parsing', 'complete'];

  for (let phase of phases) {
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      setProgress({ phase, progress: phase === 'complete' ? 100 : Math.min(i, phase === 'reading' ? 10 : phase === 'demodulating' ? 80 : 100) });
    }
  }

  const mockResult = generateMockResult();
  setResult(mockResult);
  setIsAnalyzing(false);
}

function generateMockResult() {
  const timeSlots = [];
  const frames = [];
  const callTypes = ['group_voice', 'private_voice', 'group_data', 'csbk'] as const;
  const totalDuration = 120000;

  for (let i = 0; i < 15; i++) {
    const slot = (i % 2 === 0 ? 1 : 2) as 1 | 2;
    const callType = callTypes[Math.floor(Math.random() * callTypes.length)];
    const startTime = Math.random() * (totalDuration - 10000);
    const duration = 2000 + Math.random() * 8000;

    timeSlots.push({
      slot,
      startTime,
      endTime: startTime + duration,
      callType,
      sourceId: Math.floor(Math.random() * 100000) + 1000,
      destinationId: Math.floor(Math.random() * 10000) + 100,
      duration,
    });

    for (let j = 0; j < 5; j++) {
      frames.push({
        slot,
        timestamp: startTime + j * 500,
        frameType: callType.includes('voice') ? 'voice' : callType === 'csbk' ? 'csbk' : 'data',
        callType,
        sourceId: Math.floor(Math.random() * 100000) + 1000,
        destinationId: Math.floor(Math.random() * 10000) + 100,
        colorCode: Math.floor(Math.random() * 16),
      });
    }
  }

  timeSlots.sort((a, b) => a.startTime - b.startTime);

  return {
    fileInfo: {
      path: '/mock/test.wav',
      name: 'test_recording.wav',
      sampleRate: 48000,
      channels: 1,
      bitsPerSample: 16,
      duration: 120,
      size: 11520000,
    },
    demodulation: {
      symbols: [],
      snr: 12.5 + Math.random() * 10,
      frequencyOffset: -50 + Math.random() * 100,
      symbolErrorRate: 0.01 + Math.random() * 0.05,
      qualityScore: Math.floor(70 + Math.random() * 25),
    },
    frames,
    timeSlots,
    callStatistics: {
      totalCalls: timeSlots.length,
      byType: {
        group_voice: timeSlots.filter((t) => t.callType === 'group_voice').length,
        private_voice: timeSlots.filter((t) => t.callType === 'private_voice').length,
        group_data: timeSlots.filter((t) => t.callType === 'group_data').length,
        private_data: timeSlots.filter((t) => t.callType === 'private_data').length,
        csbk: timeSlots.filter((t) => t.callType === 'csbk').length,
        unknown: 0,
      },
      bySlot: {
        1: timeSlots.filter((t) => t.slot === 1).length,
        2: timeSlots.filter((t) => t.slot === 2).length,
      },
      totalDuration: timeSlots.reduce((sum, t) => sum + t.duration, 0),
    },
  };
}
