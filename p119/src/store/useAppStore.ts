import { create } from 'zustand';
import type {
  AppState,
  DicomSeries,
  Roi,
  RoiPoint,
  ColormapType,
  ToolType,
} from '../types/dicom';

const defaultState: AppState = {
  series: null,
  currentSliceIndex: 0,
  colormap: 'gray',
  windowCenter: 0,
  windowWidth: 0,
  activeTool: 'none',
  rois: [],
  activeRoiId: null,
  isDrawing: false,
  drawingPoints: [],
  zoom: 1.0,
  pan: { x: 0, y: 0 },
  pythonServerPort: 5000,
  loading: false,
  error: null,
};

const ROI_COLORS = [
  '#ff4444',
  '#ffbb33',
  '#00C851',
  '#33b5e5',
  '#aa66cc',
  '#ff6699',
  '#00ffff',
  '#ff8800',
];

interface AppActions {
  setSeries: (series: DicomSeries | null) => void;
  setCurrentSliceIndex: (index: number) => void;
  setColormap: (colormap: ColormapType) => void;
  setWindow: (center: number, width: number) => void;
  setActiveTool: (tool: ToolType) => void;
  setActiveRoi: (roiId: string | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setPythonServerPort: (port: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  startDrawing: () => void;
  addDrawingPoint: (point: RoiPoint) => void;
  finishDrawing: () => void;
  cancelDrawing: () => void;
  addRoi: (name?: string) => void;
  removeRoi: (roiId: string) => void;
  updateRoi: (roiId: string, updates: Partial<Roi>) => void;
  updateRoiContour: (roiId: string, sliceIndex: number, points: RoiPoint[]) => void;
  resetView: () => void;
  resetAll: () => void;
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  ...defaultState,

  setSeries: (series) => {
    if (series) {
      set({
        series,
        currentSliceIndex: 0,
        windowCenter: series.slices[0]?.windowCenter || 0,
        windowWidth: series.slices[0]?.windowWidth || 0,
        rois: [],
        activeRoiId: null,
        zoom: 1.0,
        pan: { x: 0, y: 0 },
      });
    } else {
      set({ series: null, rois: [] });
    }
  },

  setCurrentSliceIndex: (index) => {
    const { series } = get();
    if (series && index >= 0 && index < series.slices.length) {
      const slice = series.slices[index];
      set({
        currentSliceIndex: index,
        windowCenter: slice.windowCenter,
        windowWidth: slice.windowWidth,
        isDrawing: false,
        drawingPoints: [],
      });
    }
  },

  setColormap: (colormap) => set({ colormap }),

  setWindow: (center, width) => set({ windowCenter: center, windowWidth: width }),

  setActiveTool: (tool) => set({ 
    activeTool: tool, 
    isDrawing: false, 
    drawingPoints: [] 
  }),

  setActiveRoi: (roiId) => set({ activeRoiId: roiId }),

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),

  setPan: (pan) => set({ pan }),

  setPythonServerPort: (port) => set({ pythonServerPort: port }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  startDrawing: () => {
    const { activeTool, series } = get();
    if (activeTool === 'polygon' && series) {
      set({ isDrawing: true, drawingPoints: [] });
    }
  },

  addDrawingPoint: (point) => {
    const { isDrawing, drawingPoints } = get();
    if (isDrawing) {
      set({ drawingPoints: [...drawingPoints, point] });
    }
  },

  finishDrawing: () => {
    const { drawingPoints, activeRoiId, currentSliceIndex } = get();
    if (drawingPoints.length >= 3) {
      if (activeRoiId) {
        get().updateRoiContour(activeRoiId, currentSliceIndex, drawingPoints);
      } else {
        get().addRoi();
      }
    }
    set({ isDrawing: false, drawingPoints: [] });
  },

  cancelDrawing: () => set({ isDrawing: false, drawingPoints: [] }),

  addRoi: (name) => {
    const { rois, drawingPoints, currentSliceIndex, series } = get();
    const roiNumber = rois.length + 1;
    const color = ROI_COLORS[(roiNumber - 1) % ROI_COLORS.length];
    
    const contours = drawingPoints.length >= 3
      ? [{ sliceIndex: currentSliceIndex, points: drawingPoints }]
      : [];

    const newRoi: Roi = {
      id: `roi-${Date.now()}`,
      name: name || `ROI_${roiNumber}`,
      color,
      contours,
      roiNumber,
    };

    set({ 
      rois: [...rois, newRoi], 
      activeRoiId: newRoi.id,
      drawingPoints: [],
      isDrawing: false,
    });
  },

  removeRoi: (roiId) => {
    const { rois, activeRoiId } = get();
    set({
      rois: rois.filter((r) => r.id !== roiId),
      activeRoiId: activeRoiId === roiId ? null : activeRoiId,
    });
  },

  updateRoi: (roiId, updates) => {
    const { rois } = get();
    set({
      rois: rois.map((r) =>
        r.id === roiId ? { ...r, ...updates } : r
      ),
    });
  },

  updateRoiContour: (roiId, sliceIndex, points) => {
    const { rois } = get();
    set({
      rois: rois.map((r) => {
        if (r.id !== roiId) return r;
        const existingIndex = r.contours.findIndex((c) => c.sliceIndex === sliceIndex);
        let newContours = [...r.contours];
        if (existingIndex >= 0) {
          newContours[existingIndex] = { sliceIndex, points };
        } else {
          newContours.push({ sliceIndex, points });
        }
        return { ...r, contours: newContours };
      }),
    });
  },

  resetView: () => set({ zoom: 1.0, pan: { x: 0, y: 0 } }),

  resetAll: () => set(defaultState),
}));
