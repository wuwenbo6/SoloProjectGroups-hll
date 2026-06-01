import { VolumeMeta, CurveMPRResult, FusionSliceResult, MeshInfo } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8081/api';

export async function extractCurveMPR(
  sessionId: string,
  controlPoints: Array<{ x: number; y: number; z: number }>,
  options?: {
    method?: 'linear' | 'bspline' | 'catmull-rom';
    numSamples?: number;
    sliceWidth?: number;
    sliceHeight?: number;
    windowWidth?: number;
    windowLevel?: number;
  }
): Promise<CurveMPRResult> {
  const response = await fetch(`${API_BASE_URL}/dicom/${sessionId}/curve-mpr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      controlPoints: controlPoints.map(p => [p.x, p.y, p.z]),
      ...options
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Curve MPR failed' }));
    throw new Error(error.error || 'Curve MPR failed');
  }

  const data = await response.json();
  data.straightened.data = Uint8Array.from(
    atob(data.straightened.data),
    c => c.charCodeAt(0)
  );

  return data;
}

export async function generateVesselCenterline(
  sessionId: string,
  startPoint: { x: number; y: number; z: number },
  endPoint: { x: number; y: number; z: number },
  threshold: number = 100
): Promise<{ centerline: Array<[number, number, number]>; numPoints: number }> {
  const response = await fetch(`${API_BASE_URL}/dicom/${sessionId}/vessel-centerline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startPoint: [startPoint.x, startPoint.y, startPoint.z],
      endPoint: [endPoint.x, endPoint.y, endPoint.z],
      threshold
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Centerline extraction failed' }));
    throw new Error(error.error || 'Centerline extraction failed');
  }

  return response.json();
}

export async function uploadCTForFusion(files: File[]): Promise<{ sessionId: string; meta: VolumeMeta; modality: string }> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  const response = await fetch(`${API_BASE_URL}/fusion/upload-ct`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'CT upload failed' }));
    throw new Error(error.error || 'CT upload failed');
  }

  return response.json();
}

export async function uploadPETForFusion(files: File[]): Promise<{ sessionId: string; meta: VolumeMeta; modality: string }> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  const response = await fetch(`${API_BASE_URL}/fusion/upload-pet`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'PET upload failed' }));
    throw new Error(error.error || 'PET upload failed');
  }

  return response.json();
}

export async function getFusionSlice(
  ctSessionId: string,
  petSessionId: string,
  plane: 'axial' | 'sagittal' | 'coronal',
  index: number,
  options?: {
    blendMode?: 'alpha' | 'checkerboard' | 'color_overlay';
    alpha?: number;
  }
): Promise<FusionSliceResult> {
  const response = await fetch(`${API_BASE_URL}/fusion/slice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ctSessionId,
      petSessionId,
      plane,
      index,
      ...options
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Fusion slice failed' }));
    throw new Error(error.error || 'Fusion slice failed');
  }

  const data = await response.json();
  data.data = Uint8Array.from(
    atob(data.data),
    c => c.charCodeAt(0)
  );

  return data;
}

export async function exportSTL(
  sessionId: string,
  options?: {
    threshold?: number;
    smooth?: boolean;
    simplify?: boolean;
    format?: 'stl' | 'ply';
  }
): Promise<{
  success: boolean;
  filename: string;
  url: string;
  numVertices: number;
  numFaces: number;
  fileSize: number;
}> {
  const response = await fetch(`${API_BASE_URL}/export/stl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      ...options
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'STL export failed' }));
    throw new Error(error.error || 'STL export failed');
  }

  return response.json();
}

export async function getMeshPreview(
  sessionId: string,
  threshold?: number
): Promise<MeshInfo> {
  const response = await fetch(`${API_BASE_URL}/export/mesh-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      threshold
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Mesh preview failed' }));
    throw new Error(error.error || 'Mesh preview failed');
  }

  return response.json();
}

export async function exportMultiSTL(
  sessionId: string,
  thresholds: number[],
  format: 'stl' | 'ply' = 'stl'
): Promise<{
  success: boolean;
  surfaces: Array<{
    filename: string;
    num_vertices: number;
    num_faces: number;
    file_size: number;
    threshold: number;
  }>;
}> {
  const response = await fetch(`${API_BASE_URL}/export/multi-stl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      thresholds,
      format
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Multi-STL export failed' }));
    throw new Error(error.error || 'Multi-STL export failed');
  }

  return response.json();
}
