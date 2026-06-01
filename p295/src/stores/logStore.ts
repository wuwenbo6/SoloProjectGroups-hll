import { create } from 'zustand';
import type { LogEntry, SearchResponse, StatsResponse } from '@/types';

interface LogStore {
  logs: LogEntry[];
  total: number;
  page: number;
  limit: number;
  query: string;
  stats: StatsResponse | null;
  loading: boolean;
  expandedIds: Set<string>;
  setQuery: (q: string) => void;
  searchLogs: (q?: string, page?: number) => Promise<void>;
  fetchStats: () => Promise<void>;
  toggleExpand: (id: string) => void;
  loadMore: () => Promise<void>;
}

export const useLogStore = create<LogStore>((set, get) => ({
  logs: [],
  total: 0,
  page: 1,
  limit: 50,
  query: '',
  stats: null,
  loading: false,
  expandedIds: new Set(),

  setQuery: (q: string) => set({ query: q }),

  searchLogs: async (q?: string, page?: number) => {
    const query = q ?? get().query;
    const p = page ?? 1;
    set({ loading: true });
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      params.set('page', String(p));
      params.set('limit', String(get().limit));
      const res = await fetch(`/api/logs?${params}`);
      const data: SearchResponse = await res.json();
      set({
        logs: p === 1 ? data.data : [...get().logs, ...data.data],
        total: data.total,
        page: data.page,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  fetchStats: async () => {
    try {
      const res = await fetch('/api/logs/stats');
      const data: StatsResponse = await res.json();
      set({ stats: data });
    } catch {
      // ignore
    }
  },

  toggleExpand: (id: string) => {
    const current = new Set(get().expandedIds);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    set({ expandedIds: current });
  },

  loadMore: async () => {
    const { page, loading, total, logs } = get();
    if (loading || logs.length >= total) return;
    await get().searchLogs(undefined, page + 1);
  },
}));
