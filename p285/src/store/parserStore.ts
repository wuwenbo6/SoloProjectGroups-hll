import { create } from 'zustand';
import type { ParseResult } from '../types';

interface ParserState {
  result: ParseResult | null;
  loading: boolean;
  error: string | null;
  fileName: string | null;
  parse: (file: File) => Promise<void>;
  reset: () => void;
}

export const useParserStore = create<ParserState>((set) => ({
  result: null,
  loading: false,
  error: null,
  fileName: null,

  parse: async (file: File) => {
    set({ loading: true, error: null, fileName: file.name });
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      });

      const data: ParseResult = await response.json();

      if (!response.ok || !data.success) {
        set({
          loading: false,
          error: data.error || `HTTP ${response.status}`,
          result: null,
        });
        return;
      }

      set({ loading: false, result: data, error: null });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        result: null,
      });
    }
  },

  reset: () => {
    set({ result: null, loading: false, error: null, fileName: null });
  },
}));
