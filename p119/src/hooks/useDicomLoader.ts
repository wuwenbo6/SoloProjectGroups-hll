import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { loadDicomSeries, getSlice, setApiPort } from '../utils/api';
import type { ColormapType } from '../types/dicom';

export const useDicomLoader = () => {
  const {
    series,
    currentSliceIndex,
    colormap,
    windowCenter,
    windowWidth,
    setSeries,
    setLoading,
    setError,
    setPythonServerPort,
  } = useAppStore();

  const [currentImageData, setCurrentImageData] = useState<string | null>(null);
  const [pixelMinMax, setPixelMinMax] = useState<[number, number]>([0, 0]);
  const [isPythonReady, setIsPythonReady] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      const cleanupReady = window.electronAPI.onPythonReady(() => {
        setIsPythonReady(true);
        window.electronAPI.getPythonPort().then((port) => {
          setApiPort(port);
          setPythonServerPort(port);
        });
      });

      const cleanupError = window.electronAPI.onPythonError((error) => {
        console.error('Python error:', error);
        setError('Python backend error: ' + error);
      });

      window.electronAPI.getPythonPort().then((port) => {
        if (port > 0) {
          setApiPort(port);
          setPythonServerPort(port);
          setIsPythonReady(true);
        }
      });

      return () => {
        cleanupReady();
        cleanupError();
      };
    } else {
      setIsPythonReady(true);
    }
  }, [setError, setPythonServerPort]);

  const loadSeries = useCallback(async (folderPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadDicomSeries(folderPath);
      setSeries(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load DICOM series');
      setSeries(null);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, setSeries]);

  const loadCurrentSlice = useCallback(async () => {
    if (!series) return;

    try {
      const result = await getSlice(
        currentSliceIndex,
        colormap,
        windowCenter > 0 ? windowCenter : undefined,
        windowWidth > 0 ? windowWidth : undefined
      );
      setCurrentImageData(result.imageData);
      setPixelMinMax(result.minMax);
    } catch (err) {
      console.error('Failed to load slice:', err);
    }
  }, [series, currentSliceIndex, colormap, windowCenter, windowWidth]);

  useEffect(() => {
    loadCurrentSlice();
  }, [loadCurrentSlice]);

  const selectAndLoadFolder = useCallback(async () => {
    if (window.electronAPI) {
      const folderPath = await window.electronAPI.selectDicomFolder();
      if (folderPath) {
        await loadSeries(folderPath);
      }
    }
  }, [loadSeries]);

  return {
    series,
    currentImageData,
    pixelMinMax,
    isPythonReady,
    loadSeries,
    selectAndLoadFolder,
    reloadCurrentSlice: loadCurrentSlice,
  };
};
