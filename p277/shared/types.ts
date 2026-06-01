export interface TWTParams {
  wakeInterval: number;
  wakeDuration: number;
  wakeOffset: number;
}

export interface PowerProfile {
  awakePower: number;
  sleepPower: number;
  transitionPower: number;
}

export interface TWTGroup {
  id: string;
  name: string;
  color: string;
  twtParams: TWTParams;
  staIds: string[];
}

export interface STA {
  id: string;
  name: string;
  macAddress: string;
  twtParams: TWTParams;
  powerProfile: PowerProfile;
  status: 'sleeping' | 'awake' | 'transition' | 'negotiating' | 'disconnected';
  negotiated: boolean;
  negotiatedTWT?: TWTParams;
  color: string;
  groupId?: string;
  twtMode: 'individual' | 'broadcast';
}

export interface AccessPoint {
  id: string;
  name: string;
  maxSupportedSTAs: number;
  twtCapability: {
    supportBroadcast: boolean;
    supportIndividual: boolean;
    minWakeInterval: number;
    maxWakeInterval: number;
    minWakeDuration?: number;
    maxWakeDuration?: number;
  };
}

export interface Timeslot {
  staId: string;
  startTime: number;
  duration: number;
  type: 'wake' | 'sleep' | 'transition';
}

export interface PowerData {
  staId: string;
  timestamp: number;
  currentPower: number;
  totalEnergy: number;
  savedEnergy: number;
  savingRatio: number;
  baselineEnergy: number;
}

export interface SavingCurvePoint {
  time: number;
  overallSavingRatio: number;
  totalEnergyConsumed: number;
  totalEnergySaved: number;
  staSavingRatios: Record<string, number>;
}

export interface SimulationState {
  isRunning: boolean;
  currentTime: number;
  speed: number;
  duration: number;
  ap: AccessPoint;
  stas: STA[];
  timeslots: Timeslot[];
  powerStats: PowerData[];
  overallSavingRatio: number;
  totalEnergyConsumed: number;
  totalEnergySaved: number;
  twtGroups: TWTGroup[];
  savingCurve: SavingCurvePoint[];
}

export interface SimulationConfig {
  duration: number;
  speed: number;
  staCount: number;
  defaultTWTParams: TWTParams;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface NegotiationLog {
  timestamp: number;
  staId: string;
  staName: string;
  type: 'request' | 'response' | 'complete' | 'reject' | 'failed' | 'adjust' | 'broadcast';
  message: string;
  params?: TWTParams;
}
