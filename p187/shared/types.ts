export interface UWBDataPoint {
  timestamp: number;
  distance: number;
}

export interface KalmanParams {
  processNoise: number;
  measurementNoise: number;
  estimationError: number;
  initialValue: number;
  adaptiveEnabled: boolean;
  forgettingFactor: number;
  lagCompensation: number;
}

export interface TagData {
  tagId: string;
  tagName: string;
  color: string;
  originalData: UWBDataPoint[];
  filteredData: UWBDataPoint[];
  statistics: Statistics | null;
}

export interface MultiTagFilterRequest {
  tags: {
    tagId: string;
    data: UWBDataPoint[];
  }[];
  params: KalmanParams;
  sharedParams: boolean;
}

export interface MultiTagFilterResult {
  tags: {
    tagId: string;
    originalData: UWBDataPoint[];
    filteredData: UWBDataPoint[];
    statistics: Statistics;
  }[];
  params: KalmanParams;
}

export interface Statistics {
  original: {
    mean: number;
    variance: number;
    stdDev: number;
    min: number;
    max: number;
  };
  filtered: {
    mean: number;
    variance: number;
    stdDev: number;
    min: number;
    max: number;
  };
  improvement: {
    stdDevReduction: number;
    varianceReduction: number;
  };
}

export interface FilterResult {
  originalData: UWBDataPoint[];
  filteredData: UWBDataPoint[];
  statistics: Statistics;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
