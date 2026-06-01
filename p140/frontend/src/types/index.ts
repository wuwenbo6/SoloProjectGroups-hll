export interface VolumeMeta {
  dimensions: { x: number; y: number; z: number };
  spacing: { x: number; y: number; z: number };
  origin: { x: number; y: number; z: number };
  minValue: number;
  maxValue: number;
  patientInfo: {
    name: string;
    id: string;
    studyDate: string;
  };
}

export interface MultiPlanarData {
  axial: { data: string; width: number; height: number; index: number };
  sagittal: { data: string; width: number; height: number; index: number };
  coronal: { data: string; width: number; height: number; index: number };
}

export interface RenderParams {
  windowWidth: number;
  windowLevel: number;
  opacityThreshold: number;
  sampleDistance: number;
  renderMode: 'mip' | 'vr' | 'iso';
}

export interface ClipPlaneState {
  x: { enabled: boolean; position: number };
  y: { enabled: boolean; position: number };
  z: { enabled: boolean; position: number };
}

export interface VolumeData {
  meta: VolumeMeta | null;
  data: Uint8Array | null;
  loaded: boolean;
  loading: boolean;
}

export interface UploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
}

export type PlaneType = 'axial' | 'sagittal' | 'coronal';

export interface SliceIndex {
  axial: number;
  sagittal: number;
  coronal: number;
}

export interface WindowPreset {
  name: string;
  windowWidth: number;
  windowLevel: number;
}

export const WINDOW_PRESETS: WindowPreset[] = [
  { name: '肺窗', windowWidth: 1500, windowLevel: -600 },
  { name: '纵隔窗', windowWidth: 350, windowLevel: 50 },
  { name: '骨窗', windowWidth: 1500, windowLevel: 300 },
  { name: '脑窗', windowWidth: 80, windowLevel: 40 },
  { name: '腹部窗', windowWidth: 400, windowLevel: 40 },
];

export interface ControlPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface CurveMPRResult {
  curve_points: Array<[number, number, number]>;
  tangents: Array<[number, number, number]>;
  slices_count: number;
  straightened: {
    data: Uint8Array;
    width: number;
    height: number;
  };
}

export interface FusionState {
  ctSessionId: string | null;
  petSessionId: string | null;
  enabled: boolean;
  blendMode: 'alpha' | 'checkerboard' | 'color_overlay';
  alpha: number;
  colorMap: 'hot' | 'jet';
}

export interface FusionSliceResult {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}

export interface MeshInfo {
  numVertices: number;
  numFaces: number;
  volume: number;
  surfaceArea: number;
  bbox: {
    min: [number, number, number];
    max: [number, number, number];
  };
}
