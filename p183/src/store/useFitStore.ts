import { create } from 'zustand';
import { DataPoint, ModelType, ModelParameters, FitStatistics } from '../../shared/types';

type YAxisScale = 'log' | 'linear';

interface FitState {
  measuredData: DataPoint[];
  fittedData: DataPoint[];
  parameters: ModelParameters | null;
  statistics: FitStatistics | null;
  isLoading: boolean;
  error: string | null;
  fileName: string | null;
  yAxisScale: YAxisScale;
  modelType: ModelType;
  spiceStatement: string | null;

  setMeasuredData: (data: DataPoint[]) => void;
  setFittedData: (data: DataPoint[]) => void;
  setParameters: (params: ModelParameters | null) => void;
  setStatistics: (stats: FitStatistics | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFileName: (name: string | null) => void;
  setYAxisScale: (scale: YAxisScale) => void;
  setModelType: (type: ModelType) => void;
  setSpiceStatement: (stmt: string | null) => void;
  reset: () => void;
}

export const useFitStore = create<FitState>((set) => ({
  measuredData: [],
  fittedData: [],
  parameters: null,
  statistics: null,
  isLoading: false,
  error: null,
  fileName: null,
  yAxisScale: 'log',
  modelType: 'diode',
  spiceStatement: null,

  setMeasuredData: (data) => set({ measuredData: data }),
  setFittedData: (data) => set({ fittedData: data }),
  setParameters: (params) => set({ parameters: params }),
  setStatistics: (stats) => set({ statistics: stats }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setFileName: (name) => set({ fileName: name }),
  setYAxisScale: (scale) => set({ yAxisScale: scale }),
  setModelType: (type) => set({
    modelType: type,
    measuredData: [],
    fittedData: [],
    parameters: null,
    statistics: null,
    spiceStatement: null,
    fileName: null,
    error: null,
  }),
  setSpiceStatement: (stmt) => set({ spiceStatement: stmt }),
  reset: () => set({
    measuredData: [],
    fittedData: [],
    parameters: null,
    statistics: null,
    error: null,
    fileName: null,
    spiceStatement: null,
  }),
}));
