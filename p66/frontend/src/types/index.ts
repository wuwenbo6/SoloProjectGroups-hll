export type FilterType = 'blur' | 'sharpen' | 'edgeDetect' | 'oilPaint' | 'custom' | null;

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  filter: FilterType;
  filterIntensity: number;
  customKernel?: CustomKernel;
  imageData: ImageData | null;
}

export interface CustomKernel {
  size: 3 | 5;
  values: number[];
  divisor: number;
  offset: number;
  name: string;
}

export interface HistoryState {
  layers: Layer[];
  timestamp: number;
  description: string;
}

export interface FilterWorkerMessage {
  type: FilterType;
  imageData: ImageData;
  intensity: number;
  customKernel?: CustomKernel;
}

export interface FilterWorkerResult {
  imageData: ImageData;
  originalSize?: { width: number; height: number };
}

export const PRESET_KERNELS: CustomKernel[] = [
  {
    name: '浮雕',
    size: 3,
    values: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
    divisor: 1,
    offset: 0,
  },
  {
    name: '高斯模糊',
    size: 3,
    values: [1, 2, 1, 2, 4, 2, 1, 2, 1],
    divisor: 16,
    offset: 0,
  },
  {
    name: '拉普拉斯',
    size: 3,
    values: [0, -1, 0, -1, 4, -1, 0, -1, 0],
    divisor: 1,
    offset: 0,
  },
  {
    name: 'Sobel X',
    size: 3,
    values: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
    divisor: 1,
    offset: 0,
  },
  {
    name: 'Sobel Y',
    size: 3,
    values: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
    divisor: 1,
    offset: 0,
  },
  {
    name: '5x5模糊',
    size: 5,
    values: [
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
    ],
    divisor: 25,
    offset: 0,
  },
];
