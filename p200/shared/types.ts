export interface CSVData {
  fileId: string;
  columns: string[];
  rows: Array<Record<string, string>>;
  rowCount: number;
}

export interface FieldMapping {
  latitude: string;
  longitude: string;
  rsrp?: string;
  sinr?: string;
}

export interface MetricStats {
  min: number;
  max: number;
  mean: number;
  count: number;
}

export interface CoverageStats {
  totalCells: number;
  validCells: number;
  coverageCells: number;
  coveragePercentage: number;
  coverageAreaSqKm: number;
  threshold: number;
}

export interface InterpolationResult {
  fileId: string;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  paddedBounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  stats: {
    rsrp?: MetricStats;
    sinr?: MetricStats;
  };
  coverageStats?: {
    rsrp?: CoverageStats;
  };
  power: number;
  searchRadius: number;
  gridSize: number;
  gridWidth: number;
  gridHeight: number;
  grids?: {
    rsrp?: Float64Array;
    sinr?: Float64Array;
  };
}

export interface DataPoint {
  lat: number;
  lon: number;
  rsrp?: number;
  sinr?: number;
}

export interface InterpolationParams {
  power: number;
  searchRadius: number;
  gridSize: number;
  padding?: number;
}

export type MetricType = 'rsrp' | 'sinr';

export interface UploadResponse {
  fileId: string;
  columns: string[];
  preview: Array<Record<string, string>>;
  rowCount: number;
  detectedFields: {
    latitude?: string;
    longitude?: string;
    rsrp?: string;
    sinr?: string;
  };
}

export interface InterpolateRequest {
  fileId: string;
  fieldMapping: FieldMapping;
  params: InterpolationParams;
}

export interface InterpolateResponse {
  fileId: string;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  stats: {
    rsrp?: MetricStats;
    sinr?: MetricStats;
  };
  coverageStats?: {
    rsrp?: CoverageStats;
  };
}

export interface StatsResponse {
  fileId: string;
  rowCount: number;
  stats: {
    rsrp?: MetricStats;
    sinr?: MetricStats;
  };
  coverageStats?: {
    rsrp?: CoverageStats;
  };
}

export type ColorRGB = [number, number, number];

export interface ColorStop {
  value: number;
  color: ColorRGB;
}

export const RSRP_COLOR_SCALE: ColorStop[] = [
  { value: -140, color: [255, 0, 0] },
  { value: -120, color: [255, 100, 0] },
  { value: -110, color: [255, 200, 0] },
  { value: -100, color: [255, 255, 0] },
  { value: -90, color: [150, 255, 0] },
  { value: -80, color: [0, 255, 100] },
  { value: -70, color: [0, 200, 200] },
  { value: -50, color: [0, 100, 255] },
];

export const SINR_COLOR_SCALE: ColorStop[] = [
  { value: -20, color: [255, 0, 0] },
  { value: -10, color: [255, 100, 0] },
  { value: 0, color: [255, 255, 0] },
  { value: 5, color: [200, 255, 0] },
  { value: 10, color: [0, 255, 100] },
  { value: 20, color: [0, 200, 200] },
  { value: 30, color: [0, 100, 255] },
];
