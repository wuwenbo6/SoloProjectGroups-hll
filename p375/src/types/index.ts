export interface Port {
  id: number;
  name: string;
  status: 'up' | 'down';
  type: 'normal' | 'monitor';
  macAddress?: string;
  rxPackets: number;
  txPackets: number;
}

export interface MacTableEntry {
  macAddress: string;
  portId: number;
  timestamp: number;
  age: number;
}

export interface MirrorRule {
  id: number;
  sourcePort: number;
  monitorPort: number;
  direction: 'ingress' | 'egress' | 'both';
  enabled: boolean;
}

export interface MirrorPacketMetadata {
  originalSourcePort: number;
  originalTimestamp: number;
  mirrorTimestamp: number;
  mirrorRuleId: number;
  packetSize: number;
}

export interface PacketInfo {
  id: string;
  timestamp: number;
  type: 'original' | 'mirror';
  sourcePort: number;
  destPort?: number;
  mirrorSourcePort?: number;
  mirrorMetadata?: MirrorPacketMetadata;
  ethernet: {
    srcMac: string;
    dstMac: string;
    etherType: number;
  };
  ip?: {
    version: number;
    srcIp: string;
    dstIp: string;
    protocol: number;
    ttl: number;
  };
  transport?: {
    protocol: 'tcp' | 'udp' | 'icmp';
    srcPort?: number;
    dstPort?: number;
    flags?: string[];
    type?: number;
    code?: number;
  };
  payload: string;
  hexDump: string;
  size: number;
}

export interface TokenBucketStats {
  tokensAvailable: number;
  packetsPassed: number;
  packetsDropped: number;
  bytesPassed: number;
  bytesDropped: number;
}

export interface MirrorMatch {
  protocol?: string;
  srcPort?: number;
  dstPort?: number;
  srcIp?: string;
  dstIp?: string;
  srcMac?: string;
  dstMac?: string;
}

export interface MirrorRule {
  id: number;
  sourcePort: number;
  monitorPort: number;
  direction: string;
  enabled: boolean;
  match?: MirrorMatch;
}

export interface MirrorStatsEntry {
  timestamp: number;
  ruleId: number;
  sourcePort: number;
  monitorPort: number;
  protocol?: string;
  srcIp?: string;
  dstIp?: string;
  srcPort?: number;
  dstPort?: number;
  packetSize: number;
  originalSourcePort: number;
}

export interface MirrorStatsSummary {
  totalMirroredPackets: number;
  totalDroppedPackets: number;
  totalMirroredBytes: number;
  totalDroppedBytes: number;
  byRule: Record<string, { packets: number; bytes: number }>;
  byProtocol: Record<string, number>;
  bySourcePort: Record<string, number>;
  entries: MirrorStatsEntry[];
}

export interface MirrorEngineStats {
  totalMirroredPackets: number;
  totalDroppedPackets: number;
  totalMirroredBytes: number;
  totalDroppedBytes: number;
  rateLimitMbps: number;
  rateLimitEnabled: boolean;
  tokenBucket: TokenBucketStats;
}

export interface SwitchStatus {
  running: boolean;
  uptime: number;
  totalRxPackets: number;
  totalTxPackets: number;
  totalMirrorPackets: number;
  macTableSize: number;
  name: string;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  module: string;
}

export type WebSocketMessageType = 'packet' | 'log' | 'status' | 'mac_update' | 'port_update';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: PacketInfo | LogEntry | SwitchStatus | MacTableEntry | Port;
}

export interface PacketStats {
  total: number;
  original: number;
  mirror: number;
  tcp: number;
  udp: number;
  icmp: number;
  other: number;
}
