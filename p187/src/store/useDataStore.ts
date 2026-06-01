import { create } from 'zustand';
import type {
  UWBDataPoint,
  KalmanParams,
  TagData,
  MultiTagFilterResult,
} from '../types';

interface DataStore {
  tags: TagData[];
  activeTagId: string | null;
  kalmanParams: KalmanParams;
  isProcessing: boolean;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  errorMessage: string;
  showOriginal: boolean;
  showFiltered: boolean;

  setRawData: (data: UWBDataPoint[], filename: string) => void;
  setMultiTagData: (tags: TagData[]) => void;
  setFilteredResult: (tagId: string, filteredData: UWBDataPoint[], statistics: any) => void;
  setMultiTagFilterResult: (result: MultiTagFilterResult) => void;
  setKalmanParams: (params: Partial<KalmanParams>) => void;
  setProcessing: (processing: boolean) => void;
  setUploadStatus: (
    status: 'idle' | 'uploading' | 'success' | 'error',
    errorMessage?: string
  ) => void;
  setActiveTag: (tagId: string | null) => void;
  toggleShowOriginal: () => void;
  toggleShowFiltered: () => void;
  removeTag: (tagId: string) => void;
  addTag: (tag: TagData) => void;
  clearAll: () => void;
  exportParams: () => string;
}

const defaultParams: KalmanParams = {
  processNoise: 0.001,
  measurementNoise: 0.01,
  estimationError: 1,
  initialValue: 0,
  adaptiveEnabled: true,
  forgettingFactor: 0.9,
  lagCompensation: 0.3,
};

const tagColors = [
  '#F97316',
  '#06B6D4',
  '#A855F7',
  '#10B981',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
];

function generateTagId(): string {
  return `tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const useDataStore = create<DataStore>((set, get) => ({
  tags: [],
  activeTagId: null,
  kalmanParams: defaultParams,
  isProcessing: false,
  uploadStatus: 'idle',
  errorMessage: '',
  showOriginal: true,
  showFiltered: true,

  setRawData: (data, filename) => {
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
    const { tags } = get();
    const newTag: TagData = {
      tagId: generateTagId(),
      tagName: filename.replace(/\.[^/.]+$/, ''),
      color: tagColors[tags.length % tagColors.length],
      originalData: sortedData,
      filteredData: [],
      statistics: null,
    };
    set({
      tags: [...tags, newTag],
      activeTagId: newTag.tagId,
      uploadStatus: 'success',
      errorMessage: '',
    });
  },

  setMultiTagData: (newTags) => {
    const sortedTags = newTags.map((tag) => ({
      ...tag,
      originalData: [...tag.originalData].sort((a, b) => a.timestamp - b.timestamp),
    }));
    set({
      tags: sortedTags,
      activeTagId: sortedTags[0]?.tagId || null,
    });
  },

  setFilteredResult: (tagId, filteredData, statistics) => {
    set((state) => ({
      tags: state.tags.map((tag) =>
        tag.tagId === tagId
          ? { ...tag, filteredData, statistics }
          : tag
      ),
    }));
  },

  setMultiTagFilterResult: (result) => {
    set((state) => ({
      tags: state.tags.map((tag) => {
        const processed = result.tags.find((t) => t.tagId === tag.tagId);
        return processed
          ? { ...tag, filteredData: processed.filteredData, statistics: processed.statistics }
          : tag;
      }),
      kalmanParams: result.params,
    }));
  },

  setKalmanParams: (params) =>
    set((state) => ({
      kalmanParams: { ...state.kalmanParams, ...params },
    })),

  setProcessing: (processing) => set({ isProcessing: processing }),

  setUploadStatus: (status, errorMessage = '') =>
    set({ uploadStatus: status, errorMessage }),

  setActiveTag: (tagId) => set({ activeTagId: tagId }),

  toggleShowOriginal: () =>
    set((state) => ({ showOriginal: !state.showOriginal })),

  toggleShowFiltered: () =>
    set((state) => ({ showFiltered: !state.showFiltered })),

  removeTag: (tagId) =>
    set((state) => {
      const newTags = state.tags.filter((t) => t.tagId !== tagId);
      return {
        tags: newTags,
        activeTagId: state.activeTagId === tagId
          ? newTags[0]?.tagId || null
          : state.activeTagId,
      };
    }),

  addTag: (tag) =>
    set((state) => ({
      tags: [...state.tags, {
        ...tag,
        originalData: [...tag.originalData].sort((a, b) => a.timestamp - b.timestamp),
      }],
      activeTagId: tag.tagId,
    })),

  clearAll: () =>
    set({
      tags: [],
      activeTagId: null,
      kalmanParams: defaultParams,
      isProcessing: false,
      uploadStatus: 'idle',
      errorMessage: '',
    }),

  exportParams: () => {
    const { kalmanParams } = get();
    return JSON.stringify(kalmanParams, null, 2);
  },
}));
