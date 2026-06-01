import type {
  DicomSeries,
  RoiPoint,
  RoiContour,
  Roi,
  SliceResponse,
  AreaResponse,
  VolumeResponse,
  ExportResponse,
  ColormapType,
} from '../types/dicom';

const getBaseUrl = (): string => {
  const port = window.electronAPI ? 0 : 5000;
  return `http://127.0.0.1:${port}`;
};

let apiPort = 5000;

export const setApiPort = (port: number): void => {
  apiPort = port;
};

const request = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<T> => {
  const url = `http://127.0.0.1:${apiPort}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
};

export const loadDicomSeries = async (folderPath: string): Promise<DicomSeries> => {
  return request<DicomSeries>('/api/load-series', {
    method: 'POST',
    body: JSON.stringify({ folderPath }),
  });
};

export const getSlice = async (
  index: number,
  colormap: ColormapType = 'gray',
  windowCenter?: number,
  windowWidth?: number
): Promise<SliceResponse> => {
  const params = new URLSearchParams({ colormap });
  if (windowCenter !== undefined) params.append('windowCenter', windowCenter.toString());
  if (windowWidth !== undefined) params.append('windowWidth', windowWidth.toString());
  
  return request<SliceResponse>(`/api/slice/${index}?${params.toString()}`);
};

export const getThumbnail = async (index: number): Promise<{ imageData: string }> => {
  return request<{ imageData: string }>(`/api/thumbnail/${index}`);
};

export const calculateArea = async (
  points: RoiPoint[],
  pixelSpacing: [number, number]
): Promise<AreaResponse> => {
  return request<AreaResponse>('/api/calculate/area', {
    method: 'POST',
    body: JSON.stringify({ points, pixelSpacing }),
  });
};

export const calculateVolume = async (
  contours: RoiContour[],
  pixelSpacing: [number, number],
  sliceThickness: number
): Promise<VolumeResponse> => {
  return request<VolumeResponse>('/api/calculate/volume', {
    method: 'POST',
    body: JSON.stringify({ contours, pixelSpacing, sliceThickness }),
  });
};

export const exportRtstruct = async (
  series: DicomSeries,
  rois: Roi[],
  outputPath: string
): Promise<ExportResponse> => {
  return request<ExportResponse>('/api/export/rtstruct', {
    method: 'POST',
    body: JSON.stringify({ series, rois, outputPath }),
  });
};

export const checkHealth = async (): Promise<{ status: string; message: string }> => {
  return request<{ status: string; message: string }>('/api/health');
};

export const clearCache = async (): Promise<{ status: string }> => {
  return request<{ status: string }>('/api/clear', { method: 'POST' });
};
