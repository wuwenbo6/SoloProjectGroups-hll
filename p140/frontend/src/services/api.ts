import { VolumeMeta, MultiPlanarData } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function uploadDicomFiles(files: File[]): Promise<{ sessionId: string; meta: VolumeMeta }> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  const response = await fetch(`${API_BASE_URL}/dicom/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
}

export async function generateSampleData(): Promise<{ sessionId: string; meta: VolumeMeta }> {
  const response = await fetch(`${API_BASE_URL}/dicom/sample`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to generate sample data' }));
    throw new Error(error.error || 'Failed to generate sample data');
  }

  return response.json();
}

export async function getVolumeMeta(sessionId: string): Promise<VolumeMeta> {
  const response = await fetch(`${API_BASE_URL}/dicom/${sessionId}/meta`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get metadata' }));
    throw new Error(error.error || 'Failed to get metadata');
  }

  return response.json();
}

export async function getVolumeData(
  sessionId: string,
  windowWidth?: number,
  windowLevel?: number
): Promise<{ data: Uint8Array; meta: VolumeMeta }> {
  const params = new URLSearchParams();
  if (windowWidth !== undefined) params.append('windowWidth', windowWidth.toString());
  if (windowLevel !== undefined) params.append('windowLevel', windowLevel.toString());

  const url = `${API_BASE_URL}/dicom/${sessionId}/volume?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get volume data' }));
    throw new Error(error.error || 'Failed to get volume data');
  }

  const buffer = await response.arrayBuffer();

  const headerSize = 4 * 3 + 4 * 3;
  const header = new DataView(buffer, 0, headerSize);

  const dimensions = {
    x: header.getUint32(0, true),
    y: header.getUint32(4, true),
    z: header.getUint32(8, true),
  };

  const spacing = {
    x: header.getFloat32(12, true),
    y: header.getFloat32(16, true),
    z: header.getFloat32(20, true),
  };

  const volumeData = new Uint8Array(buffer, headerSize);

  const meta: VolumeMeta = {
    dimensions,
    spacing,
    origin: { x: 0, y: 0, z: 0 },
    minValue: 0,
    maxValue: 255,
    patientInfo: { name: '', id: '', studyDate: '' },
  };

  return { data: volumeData, meta };
}

export async function getMultiPlanarReconstruction(
  sessionId: string,
  options?: {
    axial?: number;
    sagittal?: number;
    coronal?: number;
    windowWidth?: number;
    windowLevel?: number;
  }
): Promise<MultiPlanarData> {
  const params = new URLSearchParams();
  if (options?.axial !== undefined) params.append('axial', options.axial.toString());
  if (options?.sagittal !== undefined) params.append('sagittal', options.sagittal.toString());
  if (options?.coronal !== undefined) params.append('coronal', options.coronal.toString());
  if (options?.windowWidth !== undefined) params.append('windowWidth', options.windowWidth.toString());
  if (options?.windowLevel !== undefined) params.append('windowLevel', options.windowLevel.toString());

  const response = await fetch(`${API_BASE_URL}/dicom/${sessionId}/mpr?${params}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get MPR data' }));
    throw new Error(error.error || 'Failed to get MPR data');
  }

  return response.json();
}

export async function getSliceImage(
  sessionId: string,
  plane: 'axial' | 'sagittal' | 'coronal',
  index: number,
  windowWidth?: number,
  windowLevel?: number
): Promise<string> {
  const params = new URLSearchParams();
  if (windowWidth !== undefined) params.append('windowWidth', windowWidth.toString());
  if (windowLevel !== undefined) params.append('windowLevel', windowLevel.toString());

  const response = await fetch(
    `${API_BASE_URL}/dicom/${sessionId}/slice/${plane}/${index}?${params}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get slice' }));
    throw new Error(error.error || 'Failed to get slice');
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function exportSlice(
  sessionId: string,
  plane: 'axial' | 'sagittal' | 'coronal',
  index: number,
  windowWidth?: number,
  windowLevel?: number
): Promise<{ success: boolean; filename: string; url: string }> {
  const response = await fetch(`${API_BASE_URL}/export/slice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      plane,
      index,
      windowWidth,
      windowLevel,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(error.error || 'Export failed');
  }

  return response.json();
}

export async function exportScreenshot(
  imageData: string,
  sessionId?: string
): Promise<{ success: boolean; filename: string; url: string }> {
  const response = await fetch(`${API_BASE_URL}/export/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageData,
      sessionId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(error.error || 'Export failed');
  }

  return response.json();
}

export async function resampleVolume(
  sessionId: string,
  useSitk: boolean = false,
  targetSpacing?: [number, number, number]
): Promise<{ success: boolean; meta: VolumeMeta }> {
  const response = await fetch(`${API_BASE_URL}/dicom/${sessionId}/resample`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      useSitk,
      targetSpacing,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Resample failed' }));
    throw new Error(error.error || 'Resample failed');
  }

  return response.json();
}

export async function cleanupSession(sessionId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/dicom/${sessionId}`, {
    method: 'DELETE',
  });
}

export function getExportUrl(filename: string): string {
  return `${API_BASE_URL}/export/download/${filename}`;
}
