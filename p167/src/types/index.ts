export type PinType = 'input' | 'output' | 'inout' | 'power' | 'ground' | 'control' | 'other';

export interface Pin {
  name: string;
  type: PinType;
  cell?: number;
  port?: string;
  description?: string;
}

export type CellFunction = 'INPUT' | 'OUTPUT' | 'OUTPUT2' | 'CONTROL' | 'OBSERVE_ONLY' | 'INTERNAL' | 'BCR' | 'BIDI';

export interface BoundaryCell {
  cellNumber: number;
  function: CellFunction;
  port: string;
  safeBit?: '0' | '1';
  disableBit?: number;
  disableResult?: '0' | '1';
}

export interface ChipInfo {
  id: string;
  name: string;
  fileName: string;
  irLength: number;
  idcode?: string;
  usercode?: string;
  pins: Pin[];
  boundaryCells: BoundaryCell[];
  parsedAt: Date;
  package?: string;
  manufacturer?: string;
  partNumber?: string;
  instructionOpcodes?: Record<string, string>;
}

export interface JTAGChain {
  devices: ChipInfo[];
  totalIRLength: number;
  totalDRLength: number;
}

export interface SVFOptions {
  targetDevice: number;
  instruction: string;
  data?: string;
  expectedData?: string;
  mask?: string;
  endIRState: string;
  endDRState: string;
  runTestClocks?: number;
  runTestTime?: number;
}

export type SVFCommandType = 'IDCODE' | 'SAMPLE' | 'EXTEST' | 'BYPASS' | 'USERCODE' | 'CUSTOM';

export interface BoundaryScanTestResult {
  testType: 'BYPASS' | 'SAMPLE' | 'PRELOAD' | 'EXTEST';
  deviceIndex: number;
  deviceName: string;
  success: boolean;
  dataIn: string;
  dataOut: string;
  expectedData?: string;
  timestamp: Date;
  duration: number;
  error?: string;
}

export interface PinState {
  name: string;
  cellNumber: number;
  direction: 'input' | 'output' | 'inout';
  value: '0' | '1' | 'Z';
  safeValue: '0' | '1';
}

export interface JTAGChainConfig {
  version: string;
  createdAt: string;
  devices: Array<{
    name: string;
    irLength: number;
    idcode?: string;
    manufacturer?: string;
    partNumber?: string;
    package?: string;
    boundaryCells: number;
    pins: Array<{
      name: string;
      type: string;
      cell?: number;
    }>;
  }>;
}

export interface ParsingError {
  line?: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ParseResult {
  success: boolean;
  chip?: ChipInfo;
  errors: ParsingError[];
}
