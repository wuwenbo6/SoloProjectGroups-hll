import { create } from "zustand";
import type { ValidationResult, RuleResult, HlsConversionResult } from "@/types/validation";

interface ValidationState {
  result: ValidationResult | null;
  loading: boolean;
  error: string | null;
  selectedRule: RuleResult | null;
  severityFilter: "all" | "error" | "warning" | "info";
  hlsResult: HlsConversionResult | null;
  hlsLoading: boolean;
  validateFile: (file: File) => Promise<void>;
  convertToHls: (file: File) => Promise<void>;
  setSelectedRule: (rule: RuleResult | null) => void;
  setSeverityFilter: (filter: "all" | "error" | "warning" | "info") => void;
  reset: () => void;
}

export const useValidationStore = create<ValidationState>((set) => ({
  result: null,
  loading: false,
  error: null,
  selectedRule: null,
  severityFilter: "all",
  hlsResult: null,
  hlsLoading: false,

  validateFile: async (file: File) => {
    set({ loading: true, error: null, result: null, selectedRule: null, severityFilter: "all" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/validate", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.detail || `Validation failed with status ${response.status}`);
      }
      const data: ValidationResult = await response.json();
      set({ result: data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  convertToHls: async (file: File) => {
    set({ hlsLoading: true, hlsResult: null });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.detail || `Conversion failed with status ${response.status}`);
      }
      const data: HlsConversionResult = await response.json();
      set({ hlsResult: data, hlsLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, hlsLoading: false });
    }
  },

  setSelectedRule: (rule) => set({ selectedRule: rule }),

  setSeverityFilter: (filter) => set({ severityFilter: filter }),

  reset: () =>
    set({
      result: null,
      loading: false,
      error: null,
      selectedRule: null,
      severityFilter: "all",
      hlsResult: null,
      hlsLoading: false,
    }),
}));
