export type LedMode = 'off' | 'on' | 'blink' | 'flash';

export interface SlotStatus {
  slot: number;
  present: boolean;
  locate: LedMode;
  fault: LedMode;
  active: LedMode;
  device?: string;
  model?: string;
  serial?: string;
}

export interface TempSensor {
  id: string;
  name: string;
  current: number;
  min?: number;
  max?: number;
  warning?: number;
  critical?: number;
}

export interface SystemStatus {
  enclosure: string;
  slot_count: number;
  slots: SlotStatus[];
  temperatures: TempSensor[];
  simulation_mode: boolean;
  updated_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface HealthStatus {
  status: string;
  simulation_mode: boolean;
  device: string;
  timestamp: string;
}

export type LedType = 'locate' | 'fault' | 'active';
export type LedAction = 'on' | 'off';

export interface LedModeInfo {
  modes: LedMode[];
  descriptions: Record<LedMode, string>;
}

export interface EventLogEntry {
  timestamp: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
}

export interface DiagnosticSummary {
  total_slots: number;
  present_drives: number;
  fault_slots: number;
  locate_active: number;
  temperature_sensors: number;
  warning_temperatures: number;
  critical_temperatures: number;
}

export interface DiagnosticLogs {
  enclosure: {
    device: string;
    vendor?: string;
    model?: string;
    firmware_version?: string;
    serial_number?: string;
    collected_at: string;
    simulation_mode: boolean;
  };
  summary?: DiagnosticSummary;
  slot_status: SlotStatus[];
  temperature: TempSensor[];
  event_log?: EventLogEntry[];
  led_configuration?: {
    modes_supported: LedMode[];
    mode_descriptions: Record<LedMode, string>;
  };
  raw_outputs?: Record<string, string>;
}
