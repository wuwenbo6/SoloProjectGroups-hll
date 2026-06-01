import { create } from 'zustand';
import type { LogState, ParseResult, ParseProgress } from '@/types';

const PAGE_SIZE = 1000;

export const useLogStore = create<LogState>((set) => ({
  parseResult: null,
  isLoading: false,
  error: null,
  progress: {
    processedLines: 0,
    foundRecords: 0,
    isComplete: false,
  },
  currentPage: 1,
  pageSize: PAGE_SIZE,
  filterTclass: 'all',
  setParseResult: (result) => set({ parseResult: result, currentPage: 1 }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setProgress: (progress: ParseProgress) => set({ progress }),
  setCurrentPage: (page: number) => set({ currentPage: page }),
  setFilterTclass: (tclass: string) => set({ filterTclass: tclass, currentPage: 1 }),
  clearData: () => set({
    parseResult: null,
    error: null,
    currentPage: 1,
    filterTclass: 'all',
    progress: { processedLines: 0, foundRecords: 0, isComplete: false },
  }),
}));
