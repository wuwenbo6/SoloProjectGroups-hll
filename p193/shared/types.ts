export enum PacketType {
  TMATS = 0x01,
  PCM = 0x02,
  ANALOG = 0x03,
  DISCRETE = 0x04,
  MESSAGE = 0x05,
  ARINC_429 = 0x06,
  MIL_STD_1553 = 0x07,
  VIDEO = 0x08,
  IMAGE = 0x09,
  UART = 0x0a,
  IEEE_1394 = 0x0b,
  PARALLEL = 0x0c,
  ETHERNET = 0x0d,
  UNKNOWN = 0xff
}

export const PacketTypeName: Record<number, string> = {
  [PacketType.TMATS]: 'TMATS',
  [PacketType.PCM]: 'PCM',
  [PacketType.ANALOG]: 'Analog',
  [PacketType.DISCRETE]: 'Discrete',
  [PacketType.MESSAGE]: 'Message',
  [PacketType.ARINC_429]: 'ARINC-429',
  [PacketType.MIL_STD_1553]: 'MIL-STD-1553',
  [PacketType.VIDEO]: 'Video',
  [PacketType.IMAGE]: 'Image',
  [PacketType.UART]: 'UART',
  [PacketType.IEEE_1394]: 'IEEE-1394',
  [PacketType.PARALLEL]: 'Parallel',
  [PacketType.ETHERNET]: 'Ethernet',
  [PacketType.UNKNOWN]: 'Unknown'
};

export interface FileHeader {
  syncPattern: string;
  versionMajor: number;
  versionMinor: number;
  fileSize: bigint;
  creationTime: Date;
  packetCount: number;
}

export interface PacketHeader {
  sync: number;
  packetType: PacketType;
  packetLength: number;
  dataLength: number;
  timestamp: bigint;
  sequenceNumber: number;
  checksumPresent: boolean;
  secondaryHeaderPresent: boolean;
  hasChecksum: boolean;
}

export interface PacketSummary {
  index: number;
  type: PacketType;
  typeName: string;
  timestamp: string;
  timestampNs: bigint;
  packetLength: number;
  dataLength: number;
  sequenceNumber: number;
  offset: number;
  checksumValid?: boolean;
  preview?: string;
}

export interface PacketDetail extends PacketSummary {
  header: PacketHeader;
  fields: Record<string, string | number | bigint>;
  rawDataHex: string;
}

export interface ParseResult {
  success: boolean;
  fileName: string;
  fileSize: number;
  fileHeader: FileHeader;
  totalPackets: number;
  packets: PacketSummary[];
  packetDetails: Record<number, PacketDetail>;
  stats: Record<number, number>;
  errors: string[];
}

export interface ParseError {
  error: string;
  code: string;
}

export interface TimeReference {
  referenceEpochNs: bigint;
  referenceTime?: Date;
  timeSource: string;
}

export interface TimeReferenceConfig {
  enabled: boolean;
  referenceEpochNs?: bigint;
  referenceTime?: string;
  autoDetectFromTmats?: boolean;
}

export interface PcmDeinterleaveConfig {
  enabled: boolean;
  channelCount: number;
  frameSize: number;
  majorFrameSize?: number;
  syncPattern?: number[];
  channelNames?: string[];
}

export interface DeinterleavedChannel {
  channelIndex: number;
  channelName?: string;
  samples: number[];
  sampleCount: number;
  minSample: number;
  maxSample: number;
  avgSample: number;
}

export interface PcmDeinterleaveResult {
  success: boolean;
  channels: DeinterleavedChannel[];
  totalSamplesPerChannel: number;
  errors: string[];
}

export interface PacketIndexEntry {
  index: number;
  type: PacketType;
  offset: number;
  packetLength: number;
  timestampNs: bigint;
}

export interface FileIndex {
  version: 1;
  fileName: string;
  fileSize: number;
  fileHash: string;
  createdAt: Date;
  totalPackets: number;
  packets: PacketIndexEntry[];
  fileHeader: FileHeader;
}

export interface ParseOptions {
  timeReference?: TimeReferenceConfig;
  pcmDeinterleave?: PcmDeinterleaveConfig;
  useIndexCache?: boolean;
}

export interface ParseResultWithOptions extends ParseResult {
  timeReferenceApplied?: boolean;
  pcmDeinterleaved?: boolean;
  indexCacheUsed?: boolean;
  indexCacheCreated?: boolean;
  deinterleaveResults?: Record<number, PcmDeinterleaveResult>;
}
