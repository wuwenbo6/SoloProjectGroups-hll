export type ODUType = "ODU0" | "ODU2" | "ODU3";
export type ClientSignalType = "ODU0" | "ODUflex";
export type MappingType = "GMP" | "AMP";
export type JustType = "none" | "positive" | "negative";

export interface PMOverhead {
  tti: number[];
  bdi: boolean;
  tim: boolean;
  bei: number;
  biae: boolean;
  status: number;
}

export interface TCMOverhead {
  level: number;
  tti: number[];
  bdi: boolean;
  tim: boolean;
  bei: number;
  status: number;
  ltc: boolean;
  ais: boolean;
  oci: boolean;
  lck: boolean;
}

export interface OPUkOverhead {
  pt: number;
  psi: number[];
  jc: number[];
  jo: number[];
  njo: number;
  pjo: number;
}

export interface ODUOverhead {
  fas: number[];
  mfas: number;
  pm: PMOverhead;
  tcm: TCMOverhead[];
  aps: number[];
  exp: number[];
  opuk: OPUkOverhead;
}

export interface TimeslotInfo {
  index: number;
  occupied: boolean;
  odu0Id: string | null;
  mappingType: MappingType | null;
  lck: boolean;
  signalType: ClientSignalType;
  tsCount: number;
  isLead: boolean;
}

export interface ODU0Signal {
  id: string;
  name: string;
  bitrateGbps: number;
  overhead: ODUOverhead;
  signalType: ClientSignalType;
  tsCount: number;
}

export interface MuxDiagramClient {
  id: string;
  name: string;
  signalType: ClientSignalType;
  bitrateGbps: number;
  tsCount: number;
  tsRange: string;
  tsIndices: number[];
  mapped: boolean;
  justification: JustificationInfo | null;
}

export interface MuxDiagramServer {
  oduType: ODUType;
  bitrateGbps: number;
  totalTimeslots: number;
  usedTimeslots: number;
  mappingType: MappingType;
}

export interface MuxDiagram {
  server: MuxDiagramServer;
  clients: MuxDiagramClient[];
  timeslots: TimeslotInfo[];
  alarms: AlarmInfo[];
  mermaid?: string;
  svgText?: string;
}

export interface FrameZone {
  name: string;
  start_col: number;
  end_col: number;
  rows: number[];
  color: string;
}

export interface ODUFrame {
  oduType: ODUType;
  rows: number;
  columns: number;
  payloadColumns: number;
  numTimeslots: number;
  bitrateGbps: number;
  data: number[][];
  zones: FrameZone[];
}

export interface JustificationInfo {
  jc: number[];
  njo: number;
  pjo: number;
  justType: JustType;
  cm: number;
  cnd: number;
  clientRateKbps: number;
  serverTsRateKbps: number;
  deltaRateKbps: number;
}

export interface AlarmInfo {
  alarmType: string;
  tsIndex: number;
  signalId: string;
  signalName: string;
  active: boolean;
}

export interface SimulatorState {
  frame: ODUFrame;
  overhead: ODUOverhead;
  timeslots: TimeslotInfo[];
  odu0Signals: ODU0Signal[];
  mappingType: MappingType;
  oduType: ODUType;
  justification: Record<string, JustificationInfo>;
  alarms: AlarmInfo[];
}
