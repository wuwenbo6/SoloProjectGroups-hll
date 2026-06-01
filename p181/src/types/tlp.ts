export interface TLPHeader {
  type: string;
  typeCode: number;
  format: number;
  length: number;
  address?: number;
  tag?: number;
  requesterId?: number;
  completerId?: number;
  status?: string;
  statusCode?: number;
  byteCount?: number;
  lowerAddress?: number;
  firstDWBE?: number;
  lastDWBE?: number;
  trafficClass?: number;
  attr?: number;
  th?: boolean;
  td?: boolean;
  ep?: boolean;
  at?: number;
}

export interface ECRCInfo {
  hasECRC: boolean;
  expected?: number;
  actual?: number;
  valid?: boolean;
  position?: number;
}

export interface TLP {
  index: number;
  rawData: Uint8Array;
  header: TLPHeader;
  payload?: Uint8Array;
  timestamp?: number;
  hasError?: boolean;
  modified?: boolean;
  ecrc?: ECRCInfo;
}

export interface ErrorInjection {
  tlpIndex: number;
  byteOffset: number;
  bitPosition: number;
  autoRecalculateECRC?: boolean;
}

export interface ParseResult {
  tlps: TLP[];
  totalLength: number;
  parseErrors: string[];
  fileName: string;
}

export interface ErrorInjection {
  tlpIndex: number;
  byteOffset: number;
  bitPosition: number;
}

export interface ModifiedTLP {
  originalData: Uint8Array;
  modifiedData: Uint8Array;
  injection: ErrorInjection;
}

export const TLP_TYPES: Record<number, string> = {
  0x00: 'MRd (Memory Read)',
  0x01: 'MRdLk (Memory Read Lock)',
  0x02: 'MWr (Memory Write)',
  0x04: 'IORd (I/O Read)',
  0x05: 'IOWr (I/O Write)',
  0x06: 'CfgRd0 (Config Read Type 0)',
  0x07: 'CfgWr0 (Config Write Type 0)',
  0x0a: 'CfgRd1 (Config Read Type 1)',
  0x0b: 'CfgWr1 (Config Write Type 1)',
  0x0c: 'Msg (Message)',
  0x0d: 'MsgD (Message Data)',
  0x10: 'Cpl (Completion)',
  0x11: 'CplD (Completion with Data)',
  0x12: 'CplLk (Completion Locked)',
  0x13: 'CplDLk (Completion Locked with Data)',
  0x18: 'TLP Digest',
  0x19: 'Transaction Descriptor',
  0x1a: 'AtomicOp (Atomic Operation)',
  0x1b: 'AtomicOp (Atomic Operation)',
};

export const COMPLETION_STATUS: Record<number, string> = {
  0x0: 'Successful Completion (SC)',
  0x1: 'Unsupported Request (UR)',
  0x2: 'Configuration Request Retry Status (CRS)',
  0x4: 'Completer Abort (CA)',
};
