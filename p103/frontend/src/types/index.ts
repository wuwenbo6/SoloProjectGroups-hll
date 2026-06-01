export interface TargetConfig {
  id?: number;
  name: string;
  ipAddress: string;
  port: number;
  slaveId: number;
  timeout: number;
  protocol?: 'modbus' | 'dnp3';
  createdAt?: string;
}

export interface TestReportSummary {
  taskId: number;
  taskName: string;
  protocol: string;
  totalPackets: number;
  totalCrashes: number;
  crashRate: number;
  durationSeconds: number;
  recommendations: string[];
}

export interface TestReportPreview {
  taskId: number;
  taskName: string;
  protocol: string;
  targetInfo: Record<string, any>;
  totalPackets: number;
  totalCrashes: number;
  crashRate: number;
  packetStatistics: Record<string, any>;
  crashDetails: any[];
  stateMachineStats: Record<string, any>;
  recommendations: string[];
  generatedAt: string;
}

export interface ReportFile {
  filename: string;
  taskId: number;
  format: 'html' | 'json';
  size: number;
  createdTime: number;
  filepath: string;
}

export interface StateTransition {
  from: string;
  to: string;
  functionCode: number | null;
  timestamp: number;
  success: boolean;
  notes: string;
}

export interface StateMachineStatus {
  currentState: string;
  previousState: string;
  stateDuration: number;
  totalTransitions: number;
  packetCount: number;
  crashCount: number;
  stateDetails: Record<string, any>;
  crashProneStates: string[];
  strategyWeights: Record<string, number>;
}

export interface MutationStrategy {
  id: string;
  name: string;
  description: string;
  category?: string;
  enabled: boolean;
  params?: Record<string, any>;
}

export interface RecoveryStatus {
  status: 'crashed' | 'recovering' | 'recovered' | 'timeout' | 'manual_required' | 'max_crashes';
  message: string;
  recoveryAttempts?: number;
  crashDuration?: number;
  recoveryCount?: number;
  crashCount?: number;
  timestamp: string;
}

export interface TestTask {
  id: number;
  name: string;
  targetId: number;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  strategies: string[];
  packetCount: number;
  crashCount: number;
  startTime?: string;
  endTime?: string;
  target?: TargetConfig;
}

export interface PacketRecord {
  id: number;
  taskId: number;
  timestamp: string;
  direction: 'sent' | 'received';
  hexData: string;
  functionCode: number;
  responseTimeMs?: number;
  isError: boolean;
  errorMessage?: string;
  description?: string;
  strategy?: string;
  hasResponse?: boolean;
}

export interface CrashRecord {
  id: number;
  taskId: number;
  timestamp: string;
  packetHex: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reproducible: boolean;
  notes?: string;
}

export interface TestCase {
  id: number;
  name: string;
  description: string;
  strategyType: string;
  params: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalTargets: number;
  totalTasks: number;
  runningTasks: number;
  totalPackets: number;
  totalCrashes: number;
  recentCrashes: CrashRecord[];
  recentTasks: TestTask[];
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  responseTimeMs?: number;
}

export interface TaskStatus {
  taskId: number;
  status: string;
  packetCount: number;
  crashCount: number;
  recoveryCount: number;
  crashPackets: any[];
  isRecovering: boolean;
  recoveryAttempts: number;
  crashDuration: number;
  currentStrategy: string | null;
  strategiesEnabled: string[];
}
