export interface BusNode {
  id: string;
  address: number;
  name: string;
  data: string;
  status: 'idle' | 'sending' | 'collision' | 'won' | 'lost' | 'backoff';
  color: string;
  backoffCount: number;
  backoffDelay: number;
}

export type BusLevel = 0 | 1;

export interface WaveformSample {
  time: number;
  nodeId: string;
  level: BusLevel;
  type: 'tx' | 'bus';
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'info' | 'send' | 'collision' | 'arbitration' | 'complete' | 'error' | 'backoff';
  message: string;
  nodeId?: string;
}

export interface BackoffResult {
  nodeId: string;
  backoffCount: number;
  delay: number;
  maxDelay: number;
}

export interface SimulationResult {
  rounds: ArbitrationRound[];
  totalTime: number;
  finalWinner: string | null;
}

export interface BusState {
  time: number;
  busLevel: BusLevel;
  activeSenders: string[];
  collisionDetected: boolean;
  winnerAddress: number | null;
  waveform: WaveformSample[];
  logs: LogEntry[];
}

export interface FrameBit {
  value: BusLevel;
  phase: 'start' | 'address' | 'function' | 'data' | 'crc' | 'stop';
  bitIndex: number;
}

export interface ArbitrationRound {
  roundNumber: number;
  startTime: number;
  endTime: number;
  participants: string[];
  winner: string | null;
  losers: string[];
  collisionBitIndex: number | null;
}

export interface ModbusRTUFrame {
  slaveAddress: number;
  functionCode: number;
  data: number[];
  crcLow: number;
  crcHigh: number;
  rawBytes: number[];
}

export interface BusStatistics {
  totalBits: number;
  activeBits: number;
  idleBits: number;
  collisionBits: number;
  utilization: number;
  totalFrames: number;
  successfulFrames: number;
  failedFrames: number;
  averageFrameSize: number;
}

export interface ArbitrationResult {
  winnerNodeId: string | null;
  winnerAddress: number | null;
  losers: string[];
  collisionBitIndex: number | null;
  waveform: WaveformSample[];
  logs: LogEntry[];
  backoffDelays: BackoffResult[];
  modbusFrame?: ModbusRTUFrame;
}

export interface FullSimulationResult {
  waveform: WaveformSample[];
  logs: LogEntry[];
  winnerNodeId: string | null;
  winnerAddress: number | null;
  loserNodeIds: string[];
  nodeBackoffCounts: Record<string, number>;
  nodeBackoffDelays: Record<string, number>;
  totalRounds: number;
  statistics: BusStatistics;
  successfulModbusFrames: ModbusRTUFrame[];
}

export const NODE_COLORS = [
  '#00d4ff',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];
