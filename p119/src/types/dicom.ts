export interface DicomSeries {
  id: string;
  patientName: string;
  patientId: string;
  studyDate: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  seriesDescription: string;
  modality: string;
  slices: DicomSlice[];
  pixelSpacing: [number, number];
  sliceThickness: number;
  rows: number;
  cols: number;
}

export interface DicomSlice {
  index: number;
  instanceUid: string;
  filepath: string;
  rows: number;
  cols: number;
  windowCenter: number;
  windowWidth: number;
  sliceLocation: number;
  imagePositionPatient: [number, number, number];
  imageOrientationPatient: [number, number, number, number, number, number];
}

export interface RoiPoint {
  x: number;
  y: number;
}

export interface RoiContour {
  sliceIndex: number;
  points: RoiPoint[];
  areaMm2?: number;
}

export interface Roi {
  id: string;
  name: string;
  color: string;
  contours: RoiContour[];
  areaMm2?: number;
  volumeMm3?: number;
  roiNumber: number;
}

export type ColormapType = 'gray' | 'rainbow' | 'hotmetal';

export type ToolType = 'pan' | 'zoom' | 'window' | 'polygon' | 'none';

export interface AppState {
  series: DicomSeries | null;
  currentSliceIndex: number;
  colormap: ColormapType;
  windowCenter: number;
  windowWidth: number;
  activeTool: ToolType;
  rois: Roi[];
  activeRoiId: string | null;
  isDrawing: boolean;
  drawingPoints: RoiPoint[];
  zoom: number;
  pan: { x: number; y: number };
  pythonServerPort: number;
  loading: boolean;
  error: string | null;
}

export interface SliceResponse {
  imageData: string;
  minMax: [number, number];
}

export interface AreaResponse {
  areaMm2: number;
}

export interface VolumeResponse {
  volumeMm3: number;
}

export interface ExportResponse {
  success: boolean;
  filePath: string;
  error?: string;
}
