export interface Template {
  id: number;
  name: string;
  station: string;
  channel: string;
  start_time: string;
  end_time: string;
  sampling_rate: number;
  created_at: string;
}

export interface Detection {
  id: number;
  template_id: number;
  station: string;
  channel: string;
  detection_time: string;
  correlation_coefficient: number;
  threshold_used?: number;
  sample_index?: number;
  created_at: string;
  template?: Template;
}

export interface DetectionResult {
  station: string;
  channel: string;
  detection_time: string;
  correlation_coefficient: number;
  template_name: string;
}

export interface DetectionResponse {
  detections: DetectionResult[];
  total: number;
}

export interface WaveformSegment {
  station: string;
  channel: string;
  start_time: string;
  end_time: string;
  sampling_rate: number;
  data: number[];
}

export interface AlignedWaveforms {
  template: WaveformSegment;
  detections: WaveformSegment[];
}
