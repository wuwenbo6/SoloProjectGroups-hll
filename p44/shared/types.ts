export interface MaterialConfig {
  id: string;
  name: string;
  metalness: number;
  roughness: number;
  color: string;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface SceneMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  modelPath: string;
  materials: MaterialConfig[];
  camera: CameraState;
}

export interface ExportParams {
  width: number;
  height: number;
  samples: number;
  format: 'png' | 'jpg';
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SceneListResponse {
  scenes: SceneMetadata[];
}
