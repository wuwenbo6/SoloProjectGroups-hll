export type ClientMessageType = 'flash' | 'read' | 'erase' | 'stop' | 'pong' | 'read_fuses' | 'write_fuses' | 'read_eeprom' | 'write_eeprom';
export type ServerMessageType = 'log' | 'progress' | 'status' | 'error' | 'complete' | 'signature_warning' | 'ping' | 'fuses_data' | 'eeprom_data';
export type LogLevel = 'info' | 'warn' | 'error' | 'success';
export type FlashStatus = 'idle' | 'connecting' | 'flashing' | 'verifying' | 'complete' | 'error' | 'reading_fuses' | 'writing_fuses' | 'reading_eeprom' | 'writing_eeprom';

export interface FuseBytes {
  low: string;
  high: string;
  extended?: string;
}

export interface FuseBit {
  name: string;
  description: string;
  bit: number;
  values?: { value: number; label: string }[];
}

export interface FuseByteConfig {
  name: string;
  bits: FuseBit[];
}

export interface FuseConfig {
  low: FuseByteConfig;
  high: FuseByteConfig;
  extended?: FuseByteConfig;
}

export interface ClientMessage {
  type: ClientMessageType;
  payload: {
    hexFile?: string;
    eepromFile?: string;
    mcu: string;
    programmer: string;
    port?: string;
    baudRate?: number;
    bitClock?: number;
    verifySignature?: boolean;
    fuses?: FuseBytes;
  };
}

export interface ServerMessage {
  type: ServerMessageType;
  payload: {
    message?: string;
    level?: LogLevel;
    progress?: number;
    status?: FlashStatus;
    timestamp?: number;
    expectedSignature?: string;
    actualSignature?: string;
    mcuName?: string;
    heartbeat?: number;
    fuses?: FuseBytes;
    eepromData?: string;
    eepromSize?: number;
  };
}

export interface MCUConfig {
  id: string;
  name: string;
  signature: string;
  flashSize: number;
  eepromSize: number;
}

export interface ProgrammerConfig {
  id: string;
  name: string;
  description: string;
}

export interface LogEntry {
  id: number;
  message: string;
  level: LogLevel;
  timestamp: number;
}

export interface UploadResponse {
  success: boolean;
  fileId: string;
  fileName: string;
  fileSize: number;
}

export interface ConfigResponse {
  mcus: MCUConfig[];
  programmers: ProgrammerConfig[];
  fuseConfigs: Record<string, FuseConfig>;
}
