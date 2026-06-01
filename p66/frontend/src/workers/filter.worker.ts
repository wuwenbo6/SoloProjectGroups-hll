import { applyFilter, downscaleImageData, CustomKernel } from '../utils/imageFilters';

interface WorkerMessage {
  type: string;
  imageData: ImageData;
  filterType: string | null;
  intensity: number;
  customKernel?: CustomKernel;
  maxDimension?: number;
}

interface WorkerResult {
  imageData: ImageData;
  originalSize?: { width: number; height: number };
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  try {
    const { imageData, filterType, intensity, customKernel, maxDimension = 2048 } = e.data;

    const originalSize = { width: imageData.width, height: imageData.height };
    
    const processedImageData = downscaleImageData(imageData, maxDimension);
    const result = applyFilter(filterType, processedImageData, intensity, customKernel);

    self.postMessage({
      imageData: result,
      originalSize,
    } as WorkerResult);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
