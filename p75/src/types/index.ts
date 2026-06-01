export interface SensorData {
  temperature: number;
  pressure: number;
  status: boolean;
  alarm: boolean;
  timestamp: string;
}

export interface ProgramFile {
  id: number;
  filename: string;
  version: string;
  filepath: string;
  size: number;
  upload_time: string;
}

export interface DownloadStatus {
  id: number;
  program_id: number;
  status: string;
  progress: number;
  start_time: string;
  end_time: string | null;
}

export interface PlcStatus {
  connected: boolean;
}

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  created_at: string;
}

export interface Recipe {
  id: number;
  name: string;
  description: string;
  parameters: RecipeParameters;
  created_by: number | null;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeParameters {
  temperatureSetpoint?: number;
  pressureSetpoint?: number;
  maxTemperature?: number;
  maxPressure?: number;
  sampleInterval?: number;
  [key: string]: any;
}

export interface AlarmLog {
  id: number;
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  temperature?: number;
  pressure?: number;
  acknowledged: 0 | 1;
  acknowledged_by?: number;
  acknowledged_by_name?: string;
  acknowledged_at?: string;
  timestamp: string;
}
