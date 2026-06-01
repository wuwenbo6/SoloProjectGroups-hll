export interface Position {
  x: number;
  y: number;
}

export interface Cell {
  pci: number;
  earfcn: number;
  position: Position;
  rsrp: number;
  q_rxlevmin: number;
  q_rxlevminoffset: number;
  q_hyst: number;
  q_offset: number;
  p_compensation: number;
  s_rxlev: number;
  r_value: number;
  is_serving: boolean;
}

export interface CellsResponse {
  cells: Cell[];
  serving_pci: number;
  map_size: number;
}

export interface SimulationStatus {
  running: boolean;
  step_count: number;
  ue_position: Position;
  serving_pci: number;
  reselection_count: number;
  config: SimulationConfig;
  treselection_counters: Record<number, number>;
}

export interface SimulationConfig {
  speed: number;
  q_rxlevmin: number;
  q_hyst: number;
  treselection: number;
  path_loss_exponent: number;
  shadow_fading_std: number;
  ue_movement_speed: number;
}

export interface LogDetails {
  rsrp_source: number;
  rsrp_target: number;
  s_rxlev_target: number;
  r_s: number;
  r_n: number;
}

export interface ReselectionLog {
  timestamp: number;
  step: number;
  event_type: "measurement" | "s_criterion" | "reselection";
  source_pci: number | null;
  target_pci: number | null;
  details: Partial<LogDetails>;
}

export interface LogsResponse {
  logs: ReselectionLog[];
}
