import { create } from 'zustand';
import type { FieldMapping, InterpolationParams, InterpolateResponse, MetricType } from '../../shared/types';

interface AppState {
  fileId: string | null;
  columns: string[];
  preview: Array<Record<string, string>>;
  rowCount: number;
  detectedFields: {
    latitude?: string;
    longitude?: string;
    rsrp?: string;
    sinr?: string;
  };
  fieldMapping: FieldMapping;
  params: InterpolationParams;
  interpolationResult: InterpolateResponse | null;
  currentMetric: MetricType;
  showMarkers: boolean;
  isUploading: boolean;
  isInterpolating: boolean;
  error: string | null;

  setFileUpload: (data: {
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
  }) => void;
  setFieldMapping: (mapping: Partial<FieldMapping>) => void;
  setParams: (params: Partial<InterpolationParams>) => void;
  setInterpolationResult: (result: InterpolateResponse) => void;
  setCurrentMetric: (metric: MetricType) => void;
  setShowMarkers: (show: boolean) => void;
  setIsUploading: (isUploading: boolean) => void;
  setIsInterpolating: (isInterpolating: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  fileId: null,
  columns: [],
  preview: [],
  rowCount: 0,
  detectedFields: {},
  fieldMapping: {
    latitude: '',
    longitude: '',
    rsrp: '',
    sinr: '',
  },
  params: {
    power: 2,
    searchRadius: 500,
    gridSize: 20,
  },
  interpolationResult: null,
  currentMetric: 'rsrp',
  showMarkers: false,
  isUploading: false,
  isInterpolating: false,
  error: null,

  setFileUpload: (data) =>
    set({
      fileId: data.fileId,
      columns: data.columns,
      preview: data.preview,
      rowCount: data.rowCount,
      detectedFields: data.detectedFields,
      fieldMapping: {
        latitude: data.detectedFields.latitude || '',
        longitude: data.detectedFields.longitude || '',
        rsrp: data.detectedFields.rsrp || '',
        sinr: data.detectedFields.sinr || '',
      },
    }),

  setFieldMapping: (mapping) =>
    set((state) => ({
      fieldMapping: { ...state.fieldMapping, ...mapping },
    })),

  setParams: (params) =>
    set((state) => ({
      params: { ...state.params, ...params },
    })),

  setInterpolationResult: (result) =>
    set({
      interpolationResult: result,
    }),

  setCurrentMetric: (metric) =>
    set({
      currentMetric: metric,
    }),

  setShowMarkers: (show) =>
    set({
      showMarkers: show,
    }),

  setIsUploading: (isUploading) =>
    set({
      isUploading,
    }),

  setIsInterpolating: (isInterpolating) =>
    set({
      isInterpolating,
    }),

  setError: (error) =>
    set({
      error,
    }),

  reset: () =>
    set({
      fileId: null,
      columns: [],
      preview: [],
      rowCount: 0,
      detectedFields: {},
      fieldMapping: {
        latitude: '',
        longitude: '',
        rsrp: '',
        sinr: '',
      },
      params: {
        power: 2,
        searchRadius: 500,
        gridSize: 20,
      },
      interpolationResult: null,
      currentMetric: 'rsrp',
      showMarkers: false,
      isUploading: false,
      isInterpolating: false,
      error: null,
    }),
}));
