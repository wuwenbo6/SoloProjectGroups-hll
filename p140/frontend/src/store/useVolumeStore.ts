import { create } from 'zustand';
import {
  VolumeMeta,
  RenderParams,
  ClipPlaneState,
  VolumeData,
  UploadState,
  SliceIndex,
} from '../types';

interface VolumeState {
  sessionId: string | null;
  volume: VolumeData;
  renderParams: RenderParams;
  clipPlanes: ClipPlaneState;
  upload: UploadState;
  sliceIndex: SliceIndex;
  showAxes: boolean;
  showBoundingBox: boolean;

  setSessionId: (id: string | null) => void;
  setVolumeData: (data: Uint8Array | null, meta: VolumeMeta | null) => void;
  setVolumeLoading: (loading: boolean) => void;
  setRenderParams: (params: Partial<RenderParams>) => void;
  setClipPlane: (axis: 'x' | 'y' | 'z', state: Partial<{ enabled: boolean; position: number }>) => void;
  setUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
  setUploadError: (error: string | null) => void;
  setSliceIndex: (plane: 'axial' | 'sagittal' | 'coronal', index: number) => void;
  setShowAxes: (show: boolean) => void;
  setShowBoundingBox: (show: boolean) => void;
  resetVolume: () => void;
}

export const useVolumeStore = create<VolumeState>((set) => ({
  sessionId: null,
  volume: {
    meta: null,
    data: null,
    loaded: false,
    loading: false,
  },
  renderParams: {
    windowWidth: 2000,
    windowLevel: 0,
    opacityThreshold: 0.15,
    sampleDistance: 1.0,
    renderMode: 'vr',
  },
  clipPlanes: {
    x: { enabled: false, position: 0.5 },
    y: { enabled: false, position: 0.5 },
    z: { enabled: false, position: 0.5 },
  },
  upload: {
    uploading: false,
    progress: 0,
    error: null,
  },
  sliceIndex: {
    axial: 0,
    sagittal: 0,
    coronal: 0,
  },
  showAxes: true,
  showBoundingBox: true,

  setSessionId: (id) => set({ sessionId: id }),

  setVolumeData: (data, meta) =>
    set((state) => ({
      volume: {
        ...state.volume,
        data,
        meta,
        loaded: !!data && !!meta,
        loading: false,
      },
      sliceIndex: meta
        ? {
            axial: Math.floor(meta.dimensions.z / 2),
            sagittal: Math.floor(meta.dimensions.x / 2),
            coronal: Math.floor(meta.dimensions.y / 2),
          }
        : state.sliceIndex,
    })),

  setVolumeLoading: (loading) =>
    set((state) => ({
      volume: { ...state.volume, loading },
    })),

  setRenderParams: (params) =>
    set((state) => ({
      renderParams: { ...state.renderParams, ...params },
    })),

  setClipPlane: (axis, clipState) =>
    set((state) => ({
      clipPlanes: {
        ...state.clipPlanes,
        [axis]: { ...state.clipPlanes[axis], ...clipState },
      },
    })),

  setUploading: (uploading) =>
    set((state) => ({
      upload: { ...state.upload, uploading, progress: uploading ? 0 : state.upload.progress },
    })),

  setUploadProgress: (progress) =>
    set((state) => ({
      upload: { ...state.upload, progress },
    })),

  setUploadError: (error) =>
    set((state) => ({
      upload: { ...state.upload, error },
    })),

  setSliceIndex: (plane, index) =>
    set((state) => ({
      sliceIndex: { ...state.sliceIndex, [plane]: index },
    })),

  setShowAxes: (show) => set({ showAxes: show }),

  setShowBoundingBox: (show) => set({ showBoundingBox: show }),

  resetVolume: () =>
    set({
      sessionId: null,
      volume: {
        meta: null,
        data: null,
        loaded: false,
        loading: false,
      },
      clipPlanes: {
        x: { enabled: false, position: 0.5 },
        y: { enabled: false, position: 0.5 },
        z: { enabled: false, position: 0.5 },
      },
    }),
}));
