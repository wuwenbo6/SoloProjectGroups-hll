export interface ChannelModel {
  type: 'AWGN' | 'Rayleigh' | 'Rician';
  kFactor?: number;
  dopplerFreq: number;
  speed: number;
}

export interface BSSType {
  bssId: number;
  color: number;
  centerFreq: number;
  channelWidth: number;
}

export interface SimulationConfig {
  numUsers: number;
  numRBs: number;
  numSlots: number;
  snrMin: number;
  snrMax: number;
  channelModel: ChannelModel;
  algorithm: 'fair' | 'maxThroughput' | 'roundRobin';
  compareMode: boolean;
  mimoMode: 'SU' | 'MU';
  maxMimoLayers: number;
  enableBSSColoring: boolean;
  numBSS: number;
  enablePowerSave: boolean;
  psmDutyCycle: number;
}

export interface UserPosition {
  userId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  distance: number;
  angle: number;
  bssId: number;
}

export interface PowerSaveState {
  userId: number;
  isActive: boolean;
  wakeUpSlot: number;
  sleepInterval: number;
  bufferedPackets: number;
}

export interface MimoLayer {
  userId: number;
  snr: number;
  mcs: number;
  throughput: number;
  channelQuality: number;
}

export interface RBAllocation {
  rbIndex: number;
  userId: number;
  snr: number;
  mcs: number;
  throughput: number;
  mimoLayers?: MimoLayer[];
  isMumo: boolean;
  bssId: number;
  bssColor: number;
  isSRAllowed: boolean;
}

export interface SlotResult {
  slotIndex: number;
  allocations: RBAllocation[];
  userStats: {
    userId: number;
    throughput: number;
    allocatedRB: number;
    powerState: 'active' | 'sleep' | 'doze';
  }[];
  totalThroughput: number;
  fairnessIndex: number;
  algorithm: string;
  bssStats: {
    bssId: number;
    color: number;
    throughput: number;
    activeUsers: number;
    srThroughput: number;
  }[];
}

export interface SimulationResult {
  config: SimulationConfig;
  currentSlot: number;
  isRunning: boolean;
  slotResults: SlotResult[];
  summary: {
    totalThroughput: number;
    avgThroughput: number;
    userThroughputs: { userId: number; total: number; avg: number; color: string; name: string }[];
    fairnessIndex: number;
    powerSaveStats: {
      totalSleepSlots: number;
      avgSleepRatio: number;
      energySaved: number;
    };
    bssSummary: {
      bssId: number;
      color: number;
      totalThroughput: number;
      srThroughput: number;
      interferenceReduction: number;
    }[];
  };
  compareResult?: {
    algorithm1: { name: string; summary: SimulationResult['summary'] };
    algorithm2: { name: string; summary: SimulationResult['summary'] };
  };
}

export interface UserState {
  id: number;
  name: string;
  color: string;
  avgThroughput: number;
  totalThroughput: number;
  currentSnr: number;
}

export interface SimulationReport {
  timestamp: string;
  config: SimulationConfig;
  summary: SimulationResult['summary'];
  slotResults: SlotResult[];
  exportFormat: 'json' | 'csv';
}

export type InitRequest = SimulationConfig;

export interface StepResponse {
  success: boolean;
  result: SlotResult;
  currentSlot: number;
}

export interface RunRequest {
  numSlots?: number;
}

export interface RunResponse {
  success: boolean;
  result: SimulationResult;
}

export const USER_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
];

export const BSS_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
];

export const getUserName = (id: number) => `用户${id + 1}`;
export const getBSSName = (id: number) => `BSS-${id + 1}`;
