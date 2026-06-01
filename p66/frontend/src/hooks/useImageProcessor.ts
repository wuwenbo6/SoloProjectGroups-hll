import { useState, useCallback, useRef, useEffect } from 'react';
import { Layer, FilterType, CustomKernel } from '../types';
import { applyFilter, downscaleImageData } from '../utils/imageFilters';
import { compositeLayers } from '../utils/layerBlend';
import { useHistory } from './useHistory';

const MAX_PROCESS_DIMENSION = 2048;

export function useImageProcessor() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [baseImageData, setBaseImageData] = useState<ImageData | null>(null);
  const [processedBaseImageData, setProcessedBaseImageData] = useState<ImageData | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const debounceRef = useRef<number | null>(null);

  const {
    pushHistory,
    undo: undoHistory,
    redo: redoHistory,
    canUndo,
    canRedo,
    clearHistory,
  } = useHistory();

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const loadImage = useCallback((file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const getImageDataFromImage = useCallback((img: HTMLImageElement, maxDimension?: number): ImageData => {
    const canvas = document.createElement('canvas');
    
    let width = img.width;
    let height = img.height;

    if (maxDimension && (width > maxDimension || height > maxDimension)) {
      const scale = Math.min(maxDimension / width, maxDimension / height);
      width = Math.floor(width * scale);
      height = Math.floor(height * scale);
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  }, []);

  const uploadImage = useCallback(async (file: File) => {
    setIsProcessing(true);
    
    try {
      const img = await loadImage(file);
      const fullImageData = getImageDataFromImage(img);
      const processedImageData = downscaleImageData(fullImageData, MAX_PROCESS_DIMENSION);

      setBaseImageData(fullImageData);
      setProcessedBaseImageData(processedImageData);
      setCanvasSize({ width: processedImageData.width, height: processedImageData.height });

      const newLayer: Layer = {
        id: `layer-${Date.now()}`,
        name: '背景图层',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        filter: null,
        filterIntensity: 0.5,
        imageData: new ImageData(
          new Uint8ClampedArray(processedImageData.data),
          processedImageData.width,
          processedImageData.height
        ),
      };

      setLayers([newLayer]);
      setSelectedLayerId(newLayer.id);
      clearHistory();
      
      setTimeout(() => {
        pushHistory([newLayer], '上传图片');
      }, 0);
    } finally {
      setIsProcessing(false);
    }
  }, [loadImage, getImageDataFromImage, clearHistory, pushHistory]);

  const addLayer = useCallback(() => {
    if (!processedBaseImageData) return;

    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name: `图层 ${layers.length + 1}`,
      visible: true,
      opacity: 0.5,
      blendMode: 'normal',
      filter: null,
      filterIntensity: 0.5,
      imageData: new ImageData(
        new Uint8ClampedArray(processedBaseImageData.data),
        processedBaseImageData.width,
        processedBaseImageData.height
      ),
    };

    const newLayers = [...layers, newLayer];
    setLayers(newLayers);
    setSelectedLayerId(newLayer.id);
    pushHistory(newLayers, `添加图层 ${newLayers.length}`);
  }, [processedBaseImageData, layers, pushHistory]);

  const deleteLayer = useCallback((layerId: string) => {
    const newLayers = layers.filter(l => l.id !== layerId);
    const newSelectedId = selectedLayerId === layerId && newLayers.length > 0 
      ? newLayers[0].id 
      : selectedLayerId;
    
    setLayers(newLayers);
    if (newSelectedId !== selectedLayerId) {
      setSelectedLayerId(newSelectedId || null);
    }
    pushHistory(newLayers, '删除图层');
  }, [layers, selectedLayerId, pushHistory]);

  const updateLayerFilterSync = useCallback((layerId: string, filter: FilterType, intensity: number, kernel?: CustomKernel) => {
    if (!processedBaseImageData) return;

    const newLayers = layers.map(layer => {
      if (layer.id !== layerId) return layer;

      let newImageData: ImageData;
      if (filter) {
        const baseCopy = new ImageData(
          new Uint8ClampedArray(processedBaseImageData.data),
          processedBaseImageData.width,
          processedBaseImageData.height
        );
        newImageData = applyFilter(filter, baseCopy, intensity, kernel);
      } else {
        newImageData = new ImageData(
          new Uint8ClampedArray(processedBaseImageData.data),
          processedBaseImageData.width,
          processedBaseImageData.height
        );
      }

      return {
        ...layer,
        filter,
        filterIntensity: intensity,
        customKernel: kernel,
        imageData: newImageData,
      };
    });

    setLayers(newLayers);
  }, [processedBaseImageData, layers]);

  const updateLayerFilter = useCallback((layerId: string, filter: FilterType, intensity: number, kernel?: CustomKernel) => {
    if (!processedBaseImageData) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const totalPixels = processedBaseImageData.width * processedBaseImageData.height;
    const useWorker = totalPixels > 1024 * 1024;

    if (useWorker) {
      setIsProcessing(true);

      debounceRef.current = window.setTimeout(() => {
        if (!workerRef.current) {
          workerRef.current = new Worker(
            new URL('../workers/filter.worker.ts', import.meta.url),
            { type: 'module' }
          );
        }

        workerRef.current.onmessage = (e) => {
          if (e.data.error) {
            console.error('Worker error:', e.data.error);
            setIsProcessing(false);
            return;
          }

          const newLayers = layers.map(layer => {
            if (layer.id !== layerId) return layer;
            return {
              ...layer,
              filter,
              filterIntensity: intensity,
              customKernel: kernel,
              imageData: e.data.imageData,
            };
          });

          setLayers(newLayers);
          setIsProcessing(false);
          pushHistory(newLayers, `应用 ${filter || '无'}滤镜`);
        };

        workerRef.current.postMessage({
          imageData: processedBaseImageData,
          filterType: filter,
          intensity,
          customKernel: kernel,
          maxDimension: MAX_PROCESS_DIMENSION,
        });
      }, 100);
    } else {
      updateLayerFilterSync(layerId, filter, intensity, kernel);
    }
  }, [processedBaseImageData, layers, updateLayerFilterSync, pushHistory]);

  const updateLayerOpacity = useCallback((layerId: string, opacity: number) => {
    const newLayers = layers.map(layer =>
      layer.id === layerId ? { ...layer, opacity } : layer
    );
    setLayers(newLayers);
    pushHistory(newLayers, '调整不透明度');
  }, [layers, pushHistory]);

  const updateLayerBlendMode = useCallback((layerId: string, blendMode: Layer['blendMode']) => {
    const newLayers = layers.map(layer =>
      layer.id === layerId ? { ...layer, blendMode } : layer
    );
    setLayers(newLayers);
    pushHistory(newLayers, `切换混合模式: ${blendMode}`);
  }, [layers, pushHistory]);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    const newLayers = layers.map(layer =>
      layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
    );
    setLayers(newLayers);
  }, [layers]);

  const moveLayer = useCallback((layerId: string, direction: 'up' | 'down') => {
    const index = layers.findIndex(l => l.id === layerId);
    if (index === -1) return;

    const newLayers = [...layers];
    if (direction === 'up' && index < layers.length - 1) {
      [newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]];
    } else if (direction === 'down' && index > 0) {
      [newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]];
    }
    
    setLayers(newLayers);
    pushHistory(newLayers, `移动图层 ${direction === 'up' ? '上移' : '下移'}`);
  }, [layers, pushHistory]);

  const undo = useCallback(() => {
    const state = undoHistory();
    if (state) {
      const restoredLayers = state.layers.map(layer => ({
        ...layer,
        imageData: layer.imageData || (processedBaseImageData ? new ImageData(
          new Uint8ClampedArray(processedBaseImageData.data),
          processedBaseImageData.width,
          processedBaseImageData.height
        ) : null),
      }));

      setLayers(restoredLayers);
    }
  }, [undoHistory, processedBaseImageData]);

  const redo = useCallback(() => {
    const state = redoHistory();
    if (state) {
      const restoredLayers = state.layers.map(layer => ({
        ...layer,
        imageData: layer.imageData || (processedBaseImageData ? new ImageData(
          new Uint8ClampedArray(processedBaseImageData.data),
          processedBaseImageData.width,
          processedBaseImageData.height
        ) : null),
      }));

      setLayers(restoredLayers);
    }
  }, [redoHistory, processedBaseImageData]);

  const getCompositedImage = useCallback((): ImageData | null => {
    if (layers.length === 0 || canvasSize.width === 0) return null;
    return compositeLayers(layers, canvasSize.width, canvasSize.height);
  }, [layers, canvasSize]);

  const exportImage = useCallback((format: 'png' | 'jpeg' = 'png'): string | null => {
    const composited = getCompositedImage();
    if (!composited) return null;

    const canvas = document.createElement('canvas');
    canvas.width = composited.width;
    canvas.height = composited.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(composited, 0, 0);

    return canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png');
  }, [getCompositedImage]);

  const selectedLayer = layers.find(l => l.id === selectedLayerId) || null;

  return {
    layers,
    selectedLayerId,
    selectedLayer,
    canvasSize,
    baseImageData,
    isProcessing,
    canUndo,
    canRedo,
    uploadImage,
    addLayer,
    deleteLayer,
    updateLayerFilter,
    updateLayerOpacity,
    updateLayerBlendMode,
    toggleLayerVisibility,
    moveLayer,
    setSelectedLayerId,
    getCompositedImage,
    exportImage,
    undo,
    redo,
  };
}
