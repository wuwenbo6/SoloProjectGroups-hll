import { create } from "zustand";

export interface DicomMetadata {
  patient_name: string;
  patient_id: string;
  modality: string;
  study_date: string;
  series_description: string;
  rows: number;
  columns: number;
  bits_allocated: number;
  pixel_spacing: number[];
}

export interface WindowParams {
  center: number;
  width: number;
}

export interface HistogramData {
  bins: number[];
  counts: number[];
  total_pixels: number;
}

export interface DicomResult {
  id: string;
  metadata: DicomMetadata;
  default_window: WindowParams;
  optimized_window: WindowParams;
  histogram: HistogramData;
  original_image: string;
  optimized_image: string;
}

interface DicomState {
  loading: boolean;
  error: string | null;
  result: DicomResult | null;
  customImage: string | null;
  customWindow: WindowParams | null;
  showOptimized: boolean;

  upload: (file: File) => Promise<void>;
  adjustWindow: (center: number, width: number) => Promise<void>;
  setShowOptimized: (v: boolean) => void;
  reset: () => void;
}

export const useDicomStore = create<DicomState>((set, get) => ({
  loading: false,
  error: null,
  result: null,
  customImage: null,
  customWindow: null,
  showOptimized: true,

  upload: async (file: File) => {
    set({ loading: true, error: null, result: null, customImage: null, customWindow: null });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/dicom/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || "Upload failed");
      }
      const data: DicomResult = await res.json();
      set({ result: data, loading: false, customWindow: data.optimized_window });
    } catch (e: any) {
      set({ error: e.message || "Unknown error", loading: false });
    }
  },

  adjustWindow: async (center: number, width: number) => {
    const { result } = get();
    if (!result) return;
    try {
      const res = await fetch("/api/dicom/window", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: result.id, center, width }),
      });
      if (!res.ok) throw new Error("Adjust failed");
      const data = await res.json();
      set({ customImage: data.image, customWindow: { center, width } });
    } catch {
      set({ error: "Window adjustment failed" });
    }
  },

  setShowOptimized: (v) => set({ showOptimized: v }),

  reset: () => set({ loading: false, error: null, result: null, customImage: null, customWindow: null, showOptimized: true }),
}));
