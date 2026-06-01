export interface TSPacketHeader {
  syncByte: number;
  transportErrorIndicator: boolean;
  payloadUnitStartIndicator: boolean;
  pid: number;
  adaptationFieldControl: number;
  continuityCounter: number;
}

export type PIDType = "PAT" | "PMT" | "PES-Video" | "PES-Audio" | "PES-Data" | "Null" | "Other";

export interface PIDInfo {
  pid: number;
  type: PIDType;
  description: string;
  streamType?: number;
  streamTypeDesc?: string;
  programNumber?: number;
  byteCount: number;
  packetCount: number;
  bandwidthPercent: number;
}

export interface PMTEntry {
  streamType: number;
  elementaryPID: number;
  esInfoLength: number;
  streamTypeDesc: string;
  programNumber: number;
}

export interface PATInfo {
  transportStreamId: number;
  versionNumber: number;
  pmtEntries: { programNumber: number; pmtPID: number }[];
}

export interface PMTInfo {
  pmtPID: number;
  programNumber: number;
  entries: PMTEntry[];
}

export interface BitratePoint {
  time: number;
  bitrate: number;
  packetCount: number;
  byteCount: number;
}

export interface PIDBitrateHistory {
  pid: number;
  points: BitratePoint[];
  averageBitrate: number;
  maxBitrate: number;
  minBitrate: number;
}

export interface AnalysisResult {
  fileId: string;
  fileName: string;
  fileSize: number;
  totalPackets: number;
  totalBytes: number;
  pids: PIDInfo[];
  pat: PATInfo;
  pmts: PMTInfo[];
  bitrateHistories: PIDBitrateHistory[];
  bitrateWindowMs: number;
}

export interface AnalyzeResponse {
  success: boolean;
  data?: AnalysisResult;
  error?: string;
}

export interface ExtractPayloadResponse {
  success: boolean;
  data?: {
    pid: number;
    size: number;
    packetCount: number;
    buffer: Buffer;
  };
  error?: string;
}

export interface BitrateHistoryResponse {
  success: boolean;
  data?: {
    pid: number;
    points: BitratePoint[];
    averageBitrate: number;
    maxBitrate: number;
    minBitrate: number;
  };
  error?: string;
}
