export interface UploadedFile {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  point_count: number;
  status: 'uploaded' | 'processing' | 'completed' | 'error';
  uploaded_at: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  l: number;
  rotation_y: number;
}

export interface Detection {
  id: number;
  file_id: string;
  file_name: string;
  class_name: 'Car' | 'Pedestrian' | string;
  confidence: number;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  l: number;
  rotation_y: number;
  created_at: string;
}

export interface PointCloudData {
  file_id: string;
  points: number[];
  point_count: number;
  dimensions: number;
}

export interface DetectionResult {
  file_id: string;
  detections: Detection[];
  count: number;
}

export interface ClassMetrics {
  ap: number;
  precision: number[];
  recall: number[];
  tp_count: number;
  fp_count: number;
  fn_count: number;
  num_gt: number;
  num_det: number;
}

export interface MapResult {
  mAP: number;
  class_aps: Record<string, number>;
  [key: string]: ClassMetrics | number | Record<string, number>;
}

export interface PRCurveData {
  recall: number[];
  precision: number[];
  ap: number;
}
