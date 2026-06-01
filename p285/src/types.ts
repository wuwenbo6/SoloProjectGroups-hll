export interface MacHeader {
  frameControl: number;
  frameControlExt: number;
  destinationTEI: number;
  sourceTEI: number;
  segmentInfo: number;
  delimiterType: number;
  delimiterTypeName: string;
  lastSegment: boolean;
  totalSegments: number;
  segmentNumber: number;
}

export interface SofInfo {
  toneMapIndex: number;
  modulationScheme: string;
  payloadLength: number;
  preambleQuality: number;
  frameControlBits: string;
}

export interface SackInfo {
  present: boolean;
  ackBitmap: string;
  acknowledgedSegments: number[];
}

export interface CCoInfo {
  present: boolean;
  ccoTEI: number;
  networkId: string;
  nidFormatted: string;
  ccoMacAddress: string;
  stationRole: string;
  beaconPeriod: number;
  beaconTimeStamp: number;
}

export interface BeaconInfo {
  present: boolean;
  nid: string;
  nidVersion: number;
  ccoMacAddress: string;
  ccoTEI: number;
  stationRole: string;
  beaconPeriod: number;
  beaconTimeStamp: number;
}

export interface SignalingInfo {
  sack: SackInfo;
  ccoInfo: CCoInfo;
  beacon: BeaconInfo;
}

export interface ReassemblyInfo {
  isSegmented: boolean;
  reassemblyComplete: boolean;
  totalSegments: number;
  receivedSegments: number;
  segmentNumber: number;
  reassemblyGroupKey: string;
  reassembledHex: string | null;
}

export interface ParsedFrame {
  frameIndex: number;
  frameType: string;
  macHeader: MacHeader;
  sof: SofInfo;
  signaling: SignalingInfo;
  reassembly: ReassemblyInfo;
  rawHex: string;
}

export interface ParseResult {
  success: boolean;
  frames: ParsedFrame[];
  error: string | null;
}
